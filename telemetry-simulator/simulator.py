# telemetry-simulator/simulator.py
import asyncio
import numpy as np
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
from loguru import logger
import random
import math
from uuid import uuid4

from config import settings
from models import (
    GridElement, TelemetryMetrics, AlarmData, 
    ElementType, ElementStatus, AlarmSeverity,
    SimulatorState, SimulationScenario
)
from database import db_manager
from websocket_client import WebSocketClient


class GridSimulator:
    """Advanced grid telemetry simulator with realistic power system modeling"""
    
    def __init__(self):
        self.elements: Dict[str, GridElement] = {}
        self.state = SimulatorState()
        self.ws_client = WebSocketClient()
        self.base_values: Dict[str, Dict] = {}
        self.load_curve = self._generate_daily_load_curve()
        self.seasonal_factors = self._generate_seasonal_factors()
        self.weather_effects = {"temperature": 20, "wind_speed": 5, "solar_irradiance": 0.8}
        
        # Alarm thresholds
        self.alarm_thresholds = {
            "voltage_high": 1.05,
            "voltage_low": 0.95,
            "frequency_high": 50.5,
            "frequency_low": 49.5,
            "line_overload": 0.9,
            "temperature_high": 80,
            "oil_temp_high": 85
        }
        
        # Recent alarms tracking (to avoid spam)
        self.recent_alarms: Dict[str, datetime] = {}
    
    async def initialize(self):
        """Initialize the simulator"""
        await db_manager.initialize()
        await self.ws_client.connect()
        await self.load_grid_elements()
        self._initialize_base_values()
        self.state.is_running = True
        self.state.start_time = datetime.now()
        logger.info("Grid simulator initialized")
    
    async def load_grid_elements(self):
        """Load grid elements from Neo4j database"""
        elements = await db_manager.get_grid_elements()
        self.elements = {element.id: element for element in elements}
        self.state.active_elements = len([e for e in elements if e.status == ElementStatus.ACTIVE])
        logger.info(f"Loaded {len(self.elements)} grid elements")
    
    def _initialize_base_values(self):
        """Initialize base values for simulation"""
        for element_id, element in self.elements.items():
            base_value = {
                "type": element.element_type,
                "status": element.status,
                "properties": element.properties
            }
            
            # Set type-specific base values
            if element.element_type == ElementType.BUS:
                base_value["voltage"] = element.voltage_level or 110
                
            elif element.element_type == ElementType.GENERATOR:
                base_value["capacity"] = element.capacity or 100
                base_value["output"] = element.output or 0
                base_value["efficiency"] = element.properties.get("efficiency", 90)
                
            elif element.element_type == ElementType.LOAD:
                base_value["demand"] = element.demand or 50
                base_value["power_factor"] = element.properties.get("power_factor", 0.95)
                base_value["priority"] = element.properties.get("priority", "medium")
                
            elif element.element_type == ElementType.LINE:
                base_value["capacity"] = element.properties.get("capacity", 100)
                base_value["resistance"] = element.resistance or 0.01
                base_value["reactance"] = element.reactance or 0.05
                
            elif element.element_type == ElementType.TRANSFORMER:
                base_value["rating"] = element.rating or 100
                base_value["tap_ratio"] = element.tap_ratio or 1.0
                base_value["oil_temp_base"] = 40
            
            self.base_values[element_id] = base_value
    
    def _generate_daily_load_curve(self) -> List[float]:
        """Generate realistic daily load curve (24 hours)"""
        hours = np.linspace(0, 24, 24)
        
        # Base load pattern with morning and evening peaks
        morning_peak = 8.5  # 8:30 AM
        evening_peak = 19.0  # 7:00 PM
        night_low = 3.0     # 3:00 AM
        
        load_curve = []
        for hour in hours:
            # Base sinusoidal pattern
            base_load = 0.6 + 0.2 * np.sin(2 * np.pi * (hour - 6) / 24)
            
            # Morning peak
            morning_factor = np.exp(-((hour - morning_peak) ** 2) / 8) * 0.3
            
            # Evening peak
            evening_factor = np.exp(-((hour - evening_peak) ** 2) / 8) * 0.4
            
            # Night reduction
            if 0 <= hour <= 6:
                night_factor = -0.2 * np.exp(-((hour - night_low) ** 2) / 4)
            else:
                night_factor = 0
            
            total_load = base_load + morning_factor + evening_factor + night_factor
            load_curve.append(max(0.3, min(1.2, total_load)))  # Clamp between 30% and 120%
        
        return load_curve
    
    def _generate_seasonal_factors(self) -> Dict[str, float]:
        """Generate seasonal adjustment factors"""
        now = datetime.now()
        day_of_year = now.timetuple().tm_yday
        
        # Seasonal load variation (higher in summer and winter)
        seasonal_load = 1.0 + 0.15 * np.cos(2 * np.pi * (day_of_year - 180) / 365)
        
        # Solar generation seasonal factor
        solar_seasonal = 0.8 + 0.4 * np.sin(2 * np.pi * (day_of_year - 80) / 365)
        
        # Wind generation seasonal factor (higher in winter)
        wind_seasonal = 0.9 + 0.3 * np.cos(2 * np.pi * (day_of_year - 30) / 365)
        
        return {
            "load": seasonal_load,
            "solar": max(0.2, solar_seasonal),
            "wind": max(0.3, wind_seasonal)
        }
    
    def get_current_load_factor(self) -> float:
        """Get current load factor based on time of day"""
        now = datetime.now()
        hour = now.hour + now.minute / 60.0
        
        # Interpolate load curve
        hour_index = int(hour)
        next_hour = (hour_index + 1) % 24
        interpolation = hour - hour_index
        
        current_factor = (
            self.load_curve[hour_index] * (1 - interpolation) +
            self.load_curve[next_hour] * interpolation
        )
        
        # Apply seasonal variation
        current_factor *= self.seasonal_factors["load"]
        
        # Add small random variation
        current_factor *= (1 + np.random.normal(0, 0.02))
        
        return max(0.3, min(1.5, current_factor))
    
    def add_noise(self, value: float, noise_factor: float, distribution: str = "normal") -> float:
        """Add realistic noise to measurements"""
        if distribution == "normal":
            noise = np.random.normal(0, noise_factor)
        elif distribution == "uniform":
            noise = np.random.uniform(-noise_factor, noise_factor)
        else:
            noise = 0
        
        return value * (1 + noise)
    
    async def simulate_bus_telemetry(self, element_id: str, base_value: Dict) -> TelemetryMetrics:
        """Simulate bus telemetry with voltage regulation effects"""
        nominal_voltage = base_value["voltage"]
        
        # Base voltage with load-dependent variation
        load_factor = self.get_current_load_factor()
        voltage_drop = 0.03 * load_factor  # 3% drop at full load
        
        voltage = nominal_voltage * (1 - voltage_drop)
        voltage = self.add_noise(voltage, settings.VOLTAGE_NOISE_FACTOR)
        
        # Calculate voltage change percentage
        voltage_change = ((voltage - nominal_voltage) / nominal_voltage) * 100
        
        # Check for voltage regulation issues
        await self._check_voltage_alarms(element_id, voltage, nominal_voltage)
        
        return TelemetryMetrics(
            element_id=element_id,
            element_type=ElementType.BUS,
            status=ElementStatus(base_value["status"]),
            voltage=voltage,
            voltage_level=nominal_voltage,
            voltage_change=voltage_change,
            frequency=self.add_noise(50.0, settings.FREQUENCY_NOISE_FACTOR)
        )
    
    async def simulate_generator_telemetry(self, element_id: str, base_value: Dict) -> TelemetryMetrics:
        """Simulate generator telemetry with realistic power plant behavior"""
        if base_value["status"] != "active":
            return TelemetryMetrics(
                element_id=element_id,
                element_type=ElementType.GENERATOR,
                status=ElementStatus(base_value["status"]),
                power=0, frequency=0, voltage=0, efficiency=0
            )
        
        capacity = base_value["capacity"]
        base_efficiency = base_value["efficiency"]
        
        # Determine generator type and adjust output
        gen_type = base_value["properties"].get("fuel_type", "thermal")
        load_factor = self.get_current_load_factor()
        
        if gen_type == "solar":
            # Solar generation based on time of day and weather
            solar_factor = self._calculate_solar_factor()
            target_output = capacity * solar_factor * self.seasonal_factors["solar"]
        elif gen_type == "wind":
            # Wind generation based on wind speed
            wind_factor = self._calculate_wind_factor()
            target_output = capacity * wind_factor * self.seasonal_factors["wind"]
        else:
            # Thermal/hydro generation follows load
            target_output = min(capacity * load_factor * np.random.uniform(0.8, 1.0), capacity)
        
        # Add generation constraints and ramp rates
        current_output = base_value.get("current_output", target_output)
        max_ramp_rate = capacity * 0.05  # 5% per minute
        
        if abs(target_output - current_output) > max_ramp_rate:
            if target_output > current_output:
                power_output = current_output + max_ramp_rate
            else:
                power_output = current_output - max_ramp_rate
        else:
            power_output = target_output
        
        # Update current output for next iteration
        base_value["current_output"] = power_output
        
        # Calculate efficiency based on loading
        load_ratio = power_output / capacity if capacity > 0 else 0
        efficiency = base_efficiency * self._efficiency_curve(load_ratio)
        
        # Frequency regulation
        frequency = 50.0 + np.random.normal(0, 0.05)
        
        # Voltage regulation
        voltage_level = base_value["properties"].get("voltage_level", 22)
        voltage = self.add_noise(voltage_level, 0.01)
        
        # Check for generator alarms
        await self._check_generator_alarms(element_id, power_output, capacity, frequency)
        
        return TelemetryMetrics(
            element_id=element_id,
            element_type=ElementType.GENERATOR,
            status=ElementStatus.ACTIVE,
            power=power_output,
            capacity=capacity,
            load_factor=load_ratio * 100,
            efficiency=efficiency,
            frequency=frequency,
            voltage=voltage,
            voltage_level=voltage_level
        )
    
    async def simulate_load_telemetry(self, element_id: str, base_value: Dict) -> TelemetryMetrics:
        """Simulate load telemetry with demand response and priority shedding"""
        if base_value["status"] != "active":
            return TelemetryMetrics(
                element_id=element_id,
                element_type=ElementType.LOAD,
                status=ElementStatus(base_value["status"]),
                power=0, current=0, power_factor=0
            )
        
        base_demand = base_value["demand"]
        priority = base_value["priority"]
        load_factor = self.get_current_load_factor()
        
        # Adjust demand based on load factor and priority
        demand_multiplier = load_factor
        
        # Priority-based load shedding simulation
        if load_factor > 1.1:  # System stress
            if priority == "low":
                demand_multiplier *= 0.7  # 30% reduction
            elif priority == "medium":
                demand_multiplier *= 0.9  # 10% reduction
            # High priority loads maintain full demand
        
        # Add random consumer behavior
        demand_variation = np.random.uniform(0.85, 1.15)
        actual_demand = base_demand * demand_multiplier * demand_variation
        
        # Power factor variation
        base_pf = base_value["power_factor"]
        power_factor = self.add_noise(base_pf, 0.05)
        power_factor = max(0.7, min(1.0, power_factor))
        
        # Calculate current (simplified)
        voltage_level = base_value["properties"].get("voltage_level", 11)
        current = actual_demand / (voltage_level * np.sqrt(3) * power_factor) if voltage_level > 0 else 0
        
        # Utilization rate
        utilization_rate = (actual_demand / base_demand) * 100 if base_demand > 0 else 0
        
        return TelemetryMetrics(
            element_id=element_id,
            element_type=ElementType.LOAD,
            status=ElementStatus.ACTIVE,
            power=actual_demand,
            demand=base_demand,
            current=current,
            power_factor=power_factor,
            utilization_rate=utilization_rate,
            voltage_level=voltage_level
        )
    
    async def simulate_line_telemetry(self, element_id: str, base_value: Dict) -> TelemetryMetrics:
        """Simulate transmission line telemetry with thermal modeling"""
        if base_value["status"] != "active":
            return TelemetryMetrics(
                element_id=element_id,
                element_type=ElementType.LINE,
                status=ElementStatus(base_value["status"]),
                current=0, loading=0, power_flow=0
            )
        
        capacity = base_value["capacity"]
        resistance = base_value["resistance"]
        load_factor = self.get_current_load_factor()
        
        # Simulate power flow based on system loading
        base_loading = np.random.uniform(20, 85) * load_factor
        loading_percent = min(100, base_loading)
        
        # Calculate current and power flow
        current = (loading_percent / 100) * capacity * 10  # Simplified
        power_flow = (loading_percent / 100) * capacity
        
        # I²R losses
        power_loss = (current / 1000) ** 2 * resistance
        
        # Thermal effects
        ambient_temp = self.weather_effects["temperature"]
        temperature = ambient_temp + (loading_percent / 100) * 50  # Up to 50°C rise
        
        # Check for line alarms
        await self._check_line_alarms(element_id, loading_percent, temperature)
        
        return TelemetryMetrics(
            element_id=element_id,
            element_type=ElementType.LINE,
            status=ElementStatus.ACTIVE,
            current=current,
            loading=loading_percent,
            power_flow=power_flow,
            power_loss=power_loss,
            temperature=temperature,
            capacity=capacity
        )
    
    async def simulate_transformer_telemetry(self, element_id: str, base_value: Dict) -> TelemetryMetrics:
        """Simulate transformer telemetry with thermal and tap position modeling"""
        if base_value["status"] != "active":
            return TelemetryMetrics(
                element_id=element_id,
                element_type=ElementType.TRANSFORMER,
                status=ElementStatus(base_value["status"]),
                loading=0, oil_temperature=0, winding_temperature=0
            )
        
        rating = base_value["rating"]
        tap_ratio = base_value["tap_ratio"]
        base_oil_temp = base_value["oil_temp_base"]
        load_factor = self.get_current_load_factor()
        
        # Loading calculation
        loading_percent = np.random.uniform(30, 90) * load_factor
        loading_percent = min(100, loading_percent)
        
        power_flow = (loading_percent / 100) * rating
        
        # Thermal modeling
        ambient_temp = self.weather_effects["temperature"]
        oil_temperature = base_oil_temp + (loading_percent / 100) * 35
        winding_temperature = oil_temperature + 15 + (loading_percent / 100) * 10
        
        # Tap position variation (voltage regulation)
        tap_variation = np.random.normal(0, 0.1)
        current_tap = tap_ratio + tap_variation
        current_tap = max(0.8, min(1.2, current_tap))
        
        # Check for transformer alarms
        await self._check_transformer_alarms(element_id, oil_temperature, loading_percent)
        
        return TelemetryMetrics(
            element_id=element_id,
            element_type=ElementType.TRANSFORMER,
            status=ElementStatus.ACTIVE,
            loading=loading_percent,
            power_flow=power_flow,
            oil_temperature=oil_temperature,
            winding_temperature=winding_temperature,
            tap_position=current_tap,
            rating=rating
        )
    
    def _calculate_solar_factor(self) -> float:
        """Calculate solar generation factor based on time and weather"""
        now = datetime.now()
        hour = now.hour + now.minute / 60.0
        
        # Solar irradiance curve (sunrise to sunset)
        if 6 <= hour <= 18:
            solar_angle = np.sin(np.pi * (hour - 6) / 12)
            base_factor = max(0, solar_angle ** 1.5)
        else:
            base_factor = 0
        
        # Weather effects
        cloud_factor = self.weather_effects["solar_irradiance"]
        
        return base_factor * cloud_factor
    
    def _calculate_wind_factor(self) -> float:
        """Calculate wind generation factor"""
        wind_speed = self.weather_effects["wind_speed"]
        
        # Wind power curve (simplified)
        if wind_speed < 3:  # Cut-in speed
            return 0
        elif wind_speed < 12:  # Rated speed
            return (wind_speed - 3) / 9
        elif wind_speed < 25:  # Cut-out speed
            return 1.0
        else:
            return 0  # Turbine shutdown
    
    def _efficiency_curve(self, load_ratio: float) -> float:
        """Generator efficiency curve based on loading"""
        # Typical thermal plant efficiency curve
        optimal_load = 0.85
        if load_ratio <= optimal_load:
            return 0.7 + 0.3 * (load_ratio / optimal_load)
        else:
            return 1.0 - 0.2 * ((load_ratio - optimal_load) / (1 - optimal_load))
    
    async def _check_voltage_alarms(self, element_id: str, voltage: float, nominal: float):
        """Check and generate voltage-related alarms"""
        voltage_ratio = voltage / nominal
        
        if voltage_ratio > self.alarm_thresholds["voltage_high"]:
            await self._create_alarm(
                element_id, "HIGH_VOLTAGE", AlarmSeverity.WARNING,
                f"High voltage: {voltage:.2f}kV ({((voltage_ratio-1)*100):+.1f}%)"
            )
        elif voltage_ratio < self.alarm_thresholds["voltage_low"]:
            await self._create_alarm(
                element_id, "LOW_VOLTAGE", AlarmSeverity.CRITICAL,
                f"Low voltage: {voltage:.2f}kV ({((voltage_ratio-1)*100):+.1f}%)"
            )
    
    async def _check_generator_alarms(self, element_id: str, power: float, capacity: float, frequency: float):
        """Check generator-specific alarms"""
        load_factor = (power / capacity) * 100 if capacity > 0 else 0
        
        if frequency > self.alarm_thresholds["frequency_high"]:
            await self._create_alarm(
                element_id, "HIGH_FREQUENCY", AlarmSeverity.WARNING,
                f"High frequency: {frequency:.2f}Hz"
            )
        elif frequency < self.alarm_thresholds["frequency_low"]:
            await self._create_alarm(
                element_id, "LOW_FREQUENCY", AlarmSeverity.WARNING,
                f"Low frequency: {frequency:.2f}Hz"
            )
        
        if load_factor > 95:
            await self._create_alarm(
                element_id, "GENERATOR_OVERLOAD", AlarmSeverity.WARNING,
                f"Generator near capacity: {load_factor:.1f}%"
            )
    
    async def _check_line_alarms(self, element_id: str, loading: float, temperature: float):
        """Check transmission line alarms"""
        if loading > self.alarm_thresholds["line_overload"] * 100:
            severity = AlarmSeverity.CRITICAL if loading > 95 else AlarmSeverity.WARNING
            await self._create_alarm(
                element_id, "LINE_OVERLOAD", severity,
                f"Line overload: {loading:.1f}%"
            )
        
        if temperature > self.alarm_thresholds["temperature_high"]:
            await self._create_alarm(
                element_id, "HIGH_TEMPERATURE", AlarmSeverity.WARNING,
                f"High conductor temperature: {temperature:.1f}°C"
            )
    
    async def _check_transformer_alarms(self, element_id: str, oil_temp: float, loading: float):
        """Check transformer-specific alarms"""
        if oil_temp > self.alarm_thresholds["oil_temp_high"]:
            await self._create_alarm(
                element_id, "HIGH_OIL_TEMP", AlarmSeverity.WARNING,
                f"High oil temperature: {oil_temp:.1f}°C"
            )
        
        if loading > 90:
            await self._create_alarm(
                element_id, "TRANSFORMER_OVERLOAD", AlarmSeverity.WARNING,
                f"Transformer overload: {loading:.1f}%"
            )
    
    async def _create_alarm(self, element_id: str, alarm_type: str, severity: AlarmSeverity, message: str):
        """Create and emit alarm if not recently created"""
        alarm_key = f"{element_id}:{alarm_type}"
        now = datetime.now()
        
        # Check if similar alarm was created recently (within 5 minutes)
        if alarm_key in self.recent_alarms:
            if now - self.recent_alarms[alarm_key] < timedelta(minutes=5):
                return  # Skip duplicate alarm
        
        self.recent_alarms[alarm_key] = now
        
        # Create alarm object
        alarm = AlarmData(
            id = str(uuid4()),
            element_id=element_id,
            element_type=self.elements[element_id].element_type,
            alarm_type=alarm_type,
            severity=severity,
            message=message
        )
        
        # Choose submission method based on configuration
        if settings.FIELD_DEVICE_MODE:
            # Send via API as field device
            await self.ws_client.submit_alarm_via_api(alarm)
        else:
            # Original method: store in DB and emit via WebSocket
            await db_manager.store_alarm(alarm)
            await self.ws_client.emit_alarm(alarm)
        
        self.state.total_alarms_generated += 1
        logger.warning(f"Alarm generated: {alarm_type} for {element_id} - {message}")
    
    async def run_simulation_cycle(self):
        """Run one simulation cycle for all elements"""
        start_time = datetime.now()
        telemetry_batch = []
        api_telemetry_batch = []
        
        try:
            for element_id, element in self.elements.items():
                if element.status != ElementStatus.ACTIVE:
                    continue
                
                base_value = self.base_values[element_id]
                
                # Generate telemetry based on element type
                if element.element_type == ElementType.BUS:
                    metrics = await self.simulate_bus_telemetry(element_id, base_value)
                elif element.element_type == ElementType.GENERATOR:
                    metrics = await self.simulate_generator_telemetry(element_id, base_value)
                elif element.element_type == ElementType.LOAD:
                    metrics = await self.simulate_load_telemetry(element_id, base_value)
                elif element.element_type == ElementType.LINE:
                    metrics = await self.simulate_line_telemetry(element_id, base_value)
                elif element.element_type == ElementType.TRANSFORMER:
                    metrics = await self.simulate_transformer_telemetry(element_id, base_value)
                else:
                    continue
                
                telemetry_batch.append(metrics)
                
                # Choose submission method based on configuration
                if settings.FIELD_DEVICE_MODE:
                    # Send via API as field device
                    api_telemetry_batch.append((element_id, metrics))
                    
                    # Send in batches
                    if len(api_telemetry_batch) >= settings.API_BATCH_SIZE:
                        await self._send_telemetry_batch_via_api(api_telemetry_batch)
                        api_telemetry_batch = []
                else:
                    # Original method: cache and emit via WebSocket
                    await db_manager.cache_latest_telemetry(element_id, metrics)
                    await self.ws_client.emit_telemetry(element_id, metrics)
            
            # Send remaining batch if in field device mode
            if settings.FIELD_DEVICE_MODE and api_telemetry_batch:
                await self._send_telemetry_batch_via_api(api_telemetry_batch)
            
            # Store telemetry batch (only if not in field device mode)
            if not settings.FIELD_DEVICE_MODE and telemetry_batch:
                await db_manager.store_telemetry_batch(telemetry_batch)
            
            # Update state
            self.state.update_count += 1
            self.state.last_update = datetime.now()
            self.state.total_telemetry_sent += len(telemetry_batch)
            
            # Calculate average update time
            cycle_time = (datetime.now() - start_time).total_seconds()
            self.state.avg_update_time = (
                (self.state.avg_update_time * (self.state.update_count - 1) + cycle_time) 
                / self.state.update_count
            )
            
            logger.debug(f"Simulation cycle completed: {len(telemetry_batch)} telemetry points in {cycle_time:.2f}s")
            
        except Exception as e:
            self.state.error_count += 1
            logger.error(f"Simulation cycle error: {e}")

    async def _send_telemetry_batch_via_api(self, telemetry_batch):
        """Send batch of telemetry data via API with retry logic"""
        for attempt in range(settings.API_RETRY_ATTEMPTS):
            try:
                success_count = 0
                for element_id, metrics in telemetry_batch:
                    if await self.ws_client.emit_telemetry_via_api(element_id, metrics):
                        success_count += 1
                    else:
                        # Small delay between failed attempts
                        await asyncio.sleep(0.1)
                
                if success_count == len(telemetry_batch):
                    logger.debug(f"Successfully sent {success_count} telemetry points via API")
                    break
                else:
                    logger.warning(f"Only {success_count}/{len(telemetry_batch)} telemetry points sent successfully")
                    
            except Exception as e:
                logger.error(f"Batch telemetry API submission attempt {attempt + 1} failed: {e}")
                if attempt < settings.API_RETRY_ATTEMPTS - 1:
                    await asyncio.sleep(2 ** attempt)  # Exponential backoff
    
    async def run(self):
        """Main simulation loop"""
        logger.info("Starting grid simulation...")
        
        while self.state.is_running:
            try:
                await self.run_simulation_cycle()
                await asyncio.sleep(settings.UPDATE_INTERVAL)
                
            except Exception as e:
                logger.error(f"Simulation error: {e}")
                self.state.error_count += 1
                await asyncio.sleep(5)  # Wait before retrying
    
    async def stop(self):
        """Stop the simulation"""
        self.state.is_running = False
        await self.ws_client.disconnect()
        await db_manager.close()
        logger.info("Grid simulation stopped")
    
    def get_state(self) -> SimulatorState:
        """Get current simulator state"""
        if self.state.start_time:
            uptime = (datetime.now() - self.state.start_time).total_seconds()
        else:
            uptime = 0
        
        return SimulatorState(
            **self.state.dict(),
            active_alarms=len([a for a in self.recent_alarms.values() 
                             if datetime.now() - a < timedelta(minutes=30)])
        )