# telemetry-simulator/models.py
from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field
from datetime import datetime
from enum import Enum
import uuid


class ElementType(str, Enum):
    BUS = "Bus"
    GENERATOR = "Generator"
    LOAD = "Load"
    LINE = "Line"
    TRANSFORMER = "Transformer"


class ElementStatus(str, Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    MAINTENANCE = "maintenance"
    FAULT = "fault"


class AlarmSeverity(str, Enum):
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


class GridElement(BaseModel):
    """Grid element data model"""
    id: str
    name: str
    element_type: ElementType
    status: ElementStatus = ElementStatus.ACTIVE
    properties: Dict[str, Any] = Field(default_factory=dict)
    position: Optional[Dict[str, float]] = None
    
    # Type-specific properties
    voltage_level: Optional[float] = None
    capacity: Optional[float] = None
    output: Optional[float] = None
    demand: Optional[float] = None
    rating: Optional[float] = None
    resistance: Optional[float] = None
    reactance: Optional[float] = None
    tap_ratio: Optional[float] = None


class TelemetryMetrics(BaseModel):
    """Telemetry data model"""
    timestamp: datetime = Field(default_factory=datetime.now)
    element_id: str
    element_type: ElementType
    status: ElementStatus
    
    # Common metrics
    voltage: Optional[float] = None
    current: Optional[float] = None
    power: Optional[float] = None
    frequency: Optional[float] = None
    
    # Specific metrics
    voltage_level: Optional[float] = None
    voltage_change: Optional[float] = None
    load_factor: Optional[float] = None
    efficiency: Optional[float] = None
    power_factor: Optional[float] = None
    loading: Optional[float] = None
    temperature: Optional[float] = None
    oil_temperature: Optional[float] = None
    winding_temperature: Optional[float] = None
    
    # Calculated metrics
    utilization_rate: Optional[float] = None
    power_flow: Optional[float] = None
    power_loss: Optional[float] = None
    tap_position: Optional[float] = None
    
    # Quality indicators
    # quality: str = "good"
    # confidence: float = 1.0


class AlarmData(BaseModel):
    """Alarm data model"""
    # id: str = Field(default_factory=lambda: f"alarm_{int(datetime.now().timestamp() * 1000)}")
    id: str = str(uuid.uuid4())
    element_id: str
    element_type: ElementType
    alarm_type: str
    severity: AlarmSeverity
    message: str
    is_active: bool = True
    is_acknowledged: bool = False
    created_at: datetime = Field(default_factory=datetime.now)
    acknowledged_at: Optional[datetime] = None
    acknowledged_by: Optional[str] = None
    resolved_at: Optional[datetime] = None
    
    # Additional context
    threshold_value: Optional[float] = None
    actual_value: Optional[float] = None
    duration: Optional[int] = None  # seconds


class SimulationScenario(BaseModel):
    """Simulation scenario configuration"""
    name: str
    description: str
    duration: int  # seconds
    load_factor: float = 1.0
    generation_factor: float = 1.0
    fault_probability: float = 0.0
    weather_condition: str = "normal"  # normal, storm, hot, cold
    time_of_day: str = "peak"  # peak, off_peak, shoulder
    
    # Event scenarios
    scheduled_outages: List[Dict[str, Any]] = Field(default_factory=list)
    contingencies: List[Dict[str, Any]] = Field(default_factory=list)
    load_shedding: bool = False


class SimulatorState(BaseModel):
    """Simulator state tracking"""
    is_running: bool = False
    start_time: Optional[datetime] = None
    update_count: int = 0
    error_count: int = 0
    last_update: Optional[datetime] = None
    active_elements: int = 0
    active_alarms: int = 0
    
    # Performance metrics
    avg_update_time: float = 0.0
    total_telemetry_sent: int = 0
    total_alarms_generated: int = 0
    
    # Current scenario
    current_scenario: Optional[str] = None


class HealthStatus(BaseModel):
    """Health check response"""
    status: str = "healthy"
    timestamp: datetime = Field(default_factory=datetime.now)
    uptime: float = 0.0
    simulator_state: SimulatorState
    database_connections: Dict[str, bool] = Field(default_factory=dict)
    version: str = "1.0.0"