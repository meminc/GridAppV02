# telemetry-simulator/field_device.py
import asyncio
import json
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from loguru import logger
import httpx

from config import settings
from models import TelemetryMetrics, AlarmData, ElementType


class FieldDeviceSimulator:
    """Simulates a real field device sending data to the grid monitoring system"""
    
    def __init__(self, device_id: str, device_type: str = "RTU"):
        self.device_id = device_id
        self.device_type = device_type
        self.auth_token: Optional[str] = None
        self.last_heartbeat = None
        self.connection_status = "disconnected"
        self.data_buffer: List[Dict] = []
        self.max_buffer_size = 100
        
    async def authenticate(self) -> bool:
        """Authenticate device with the grid monitoring system"""
        try:
            # Simulate device authentication
            auth_data = {
                "email": f"device_{self.device_id}@grid.local",
                "password": settings.SIMULATOR_SERVICE_KEY,
                "service": True,
                "deviceId": self.device_id,
                "deviceType": self.device_type
            }
            
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{settings.BACKEND_API_URL}/api/auth/service-login",
                    json=auth_data,
                    timeout=settings.API_TIMEOUT
                )
                
                if response.status_code == 200:
                    data = response.json()
                    self.auth_token = data.get("accessToken")
                    self.connection_status = "connected"
                    logger.info(f"Field device {self.device_id} authenticated successfully")
                    return True
                else:
                    logger.error(f"Device authentication failed: {response.status_code}")
                    
        except Exception as e:
            logger.error(f"Device authentication error: {e}")
        
        self.connection_status = "authentication_failed"
        return False
    
    async def send_heartbeat(self):
        """Send device heartbeat to maintain connection"""
        if not self.auth_token:
            return False
        
        try:
            headers = {"Authorization": f"Bearer {self.auth_token}"}
            heartbeat_data = {
                "deviceId": self.device_id,
                "deviceType": self.device_type,
                "timestamp": datetime.now().isoformat(),
                "status": self.connection_status,
                "bufferSize": len(self.data_buffer),
                "location": settings.DEVICE_LOCATION
            }
            
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{settings.BACKEND_API_URL}/api/devices/heartbeat",
                    json=heartbeat_data,
                    headers=headers,
                    timeout=5
                )
                
                if response.status_code == 200:
                    self.last_heartbeat = datetime.now()
                    return True
                    
        except Exception as e:
            logger.debug(f"Heartbeat failed for device {self.device_id}: {e}")
        
        return False
    
    async def send_telemetry_data(self, element_id: str, metrics: TelemetryMetrics) -> bool:
        """Send telemetry data as a field device would"""
        if not self.auth_token:
            if not await self.authenticate():
                # Buffer data if authentication fails
                self._buffer_data(element_id, metrics)
                return False
        
        try:
            # Format data as field device would
            telemetry_data = {
                "deviceId": self.device_id,
                "timestamp": metrics.timestamp.isoformat(),
                "elementId": element_id,
                "elementType": metrics.element_type.value,
                "measurements": {},
                "quality": "good",
                "source": f"field_device_{self.device_id}"
            }
            
            # Add non-null measurements
            for field, value in metrics.dict().items():
                if value is not None and field not in ['timestamp', 'element_id', 'element_type', 'status']:
                    telemetry_data["measurements"][field] = {
                        "value": value,
                        "unit": self._get_unit_for_field(field),
                        "timestamp": metrics.timestamp.isoformat()
                    }
            
            headers = {
                "Authorization": f"Bearer {self.auth_token}",
                "X-Device-ID": self.device_id,
                "X-Device-Type": self.device_type
            }
            
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{settings.BACKEND_API_URL}/api/monitoring/telemetry",
                    json=telemetry_data,
                    headers=headers,
                    timeout=settings.API_TIMEOUT
                )
                
                if response.status_code == 200:
                    # Send any buffered data
                    await self._flush_buffer()
                    return True
                else:
                    logger.warning(f"Telemetry submission failed: {response.status_code}")
                    self._buffer_data(element_id, metrics)
                    return False
                    
        except Exception as e:
            logger.error(f"Failed to send telemetry for {element_id}: {e}")
            self._buffer_data(element_id, metrics)
            return False
    
    async def send_alarm(self, alarm: AlarmData) -> bool:
        """Send alarm as field device would"""
        if not self.auth_token:
            if not await self.authenticate():
                return False
        
        try:
            alarm_data = {
                "deviceId": self.device_id,
                "alarmId": alarm.id,
                "elementId": alarm.element_id,
                "elementType": alarm.element_type.value,
                "alarmType": alarm.alarm_type,
                "severity": alarm.severity.value,
                "message": alarm.message,
                "timestamp": alarm.created_at.isoformat(),
                "acknowledgeRequired": alarm.severity == "critical",
                "source": f"field_device_{self.device_id}"
            }
            
            headers = {
                "Authorization": f"Bearer {self.auth_token}",
                "X-Device-ID": self.device_id,
                "X-Device-Type": self.device_type
            }
            
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{settings.BACKEND_API_URL}/api/monitoring/alarms",
                    json=alarm_data,
                    headers=headers,
                    timeout=settings.API_TIMEOUT
                )
                
                if response.status_code == 200:
                    logger.info(f"Alarm sent from device {self.device_id}: {alarm.alarm_type}")
                    return True
                else:
                    logger.warning(f"Alarm submission failed: {response.status_code}")
                    return False
                    
        except Exception as e:
            logger.error(f"Failed to send alarm: {e}")
            return False
    
    def _buffer_data(self, element_id: str, metrics: TelemetryMetrics):
        """Buffer data when connection is unavailable"""
        if len(self.data_buffer) >= self.max_buffer_size:
            # Remove oldest data
            self.data_buffer.pop(0)
        
        self.data_buffer.append({
            "element_id": element_id,
            "metrics": metrics.dict(),
            "buffered_at": datetime.now().isoformat()
        })
        
        logger.debug(f"Data buffered for device {self.device_id}, buffer size: {len(self.data_buffer)}")
    
    async def _flush_buffer(self):
        """Send buffered data when connection is restored"""
        if not self.data_buffer:
            return
        
        logger.info(f"Flushing {len(self.data_buffer)} buffered records for device {self.device_id}")
        
        for buffered_item in self.data_buffer.copy():
            try:
                # Reconstruct metrics object
                metrics_data = buffered_item["metrics"]
                metrics = TelemetryMetrics(
                    element_id=metrics_data["element_id"],
                    element_type=ElementType(metrics_data["element_type"]),
                    **{k: v for k, v in metrics_data.items() 
                       if k not in ["element_id", "element_type"]}
                )
                
                if await self.send_telemetry_data(buffered_item["element_id"], metrics):
                    self.data_buffer.remove(buffered_item)
                else:
                    break  # Stop if sending fails
                    
            except Exception as e:
                logger.error(f"Failed to flush buffered data: {e}")
                break
    
    def _get_unit_for_field(self, field: str) -> str:
        """Get appropriate unit for measurement field"""
        unit_map = {
            "voltage": "kV",
            "current": "A",
            "power": "MW",
            "frequency": "Hz",
            "loading": "%",
            "temperature": "°C",
            "efficiency": "%",
            "power_factor": "pu",
            "oil_temperature": "°C",
            "winding_temperature": "°C"
        }
        return unit_map.get(field, "")