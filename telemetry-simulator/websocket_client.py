# telemetry-simulator/websocket_client.py
import asyncio
import json
from typing import Optional
import socketio
import httpx
from loguru import logger

from config import settings
from models import TelemetryMetrics, AlarmData


class WebSocketClient:
    """WebSocket client for real-time communication with backend"""
    
    def __init__(self):
        self.sio: Optional[socketio.AsyncClient] = None
        self.connected = False
        self.auth_token: Optional[str] = None
        self.reconnect_attempts = 0
        self.max_reconnect_attempts = 5
    
    async def connect(self):
        """Connect to the backend WebSocket server"""
        try:
            # First, authenticate and get token
            await self._authenticate()
            
            if not self.auth_token:
                logger.error("Failed to authenticate with backend")
                return
            
            # Initialize socket.io client
            self.sio = socketio.AsyncClient(
                reconnection=True,
                reconnection_attempts=self.max_reconnect_attempts,
                reconnection_delay=2,
                reconnection_delay_max=10
            )
            
            # Register event handlers
            self._register_handlers()
            
            # Connect to server
            await self.sio.connect(
                settings.BACKEND_WS_URL,
                auth={'token': self.auth_token},
                transports=['websocket']
            )
            
            logger.info("Connected to backend WebSocket")
            self.connected = True
            self.reconnect_attempts = 0
            
        except Exception as e:
            logger.error(f"WebSocket connection failed: {e}")
            self.connected = False
            await self._handle_reconnect()
    
    async def _authenticate(self):
        """Authenticate with backend to get access token"""
        try:
            # Use service account credentials or API key
            auth_data = {
                "email": "simulator@gridmonitor.com",
                "password": "simulator_service_key",
                "service": True
            }
            
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{settings.BACKEND_API_URL}/api/auth/service-login",
                    json=auth_data,
                    timeout=10
                )
                
                if response.status_code == 200:
                    data = response.json()
                    self.auth_token = data.get("accessToken")
                    logger.info("Authenticated with backend API")
                else:
                    logger.error(f"Authentication failed: {response.status_code}")
                    
        except Exception as e:
            logger.error(f"Authentication error: {e}")
    
    def _register_handlers(self):
        """Register WebSocket event handlers"""
        
        @self.sio.event
        async def connect():
            logger.info("WebSocket connected successfully")
            self.connected = True
            self.reconnect_attempts = 0
        
        @self.sio.event
        async def disconnect():
            logger.warning("WebSocket disconnected")
            self.connected = False
        
        @self.sio.event
        async def connect_error(data):
            logger.error(f"WebSocket connection error: {data}")
            self.connected = False
            await self._handle_reconnect()
        
        @self.sio.event
        async def connection_confirmed(data):
            logger.info(f"Connection confirmed: {data}")
        
        @self.sio.event
        async def error(data):
            logger.error(f"WebSocket error: {data}")
    
    async def _handle_reconnect(self):
        """Handle reconnection logic"""
        if self.reconnect_attempts >= self.max_reconnect_attempts:
            logger.error("Max reconnection attempts reached")
            return
        
        self.reconnect_attempts += 1
        delay = min(2 ** self.reconnect_attempts, 30)  # Exponential backoff
        
        logger.info(f"Reconnecting in {delay}s (attempt {self.reconnect_attempts})")
        await asyncio.sleep(delay)
        
        await self.connect()
    
    async def emit_telemetry(self, element_id: str, metrics: TelemetryMetrics):
        """Emit telemetry data via WebSocket"""
        if not self.connected or not self.sio:
            logger.debug("WebSocket not connected, skipping telemetry emission")
            return
        
        try:
            telemetry_data = {
                "elementId": element_id,
                "data": {
                    "metrics": {k: v for k, v in metrics.dict().items() 
                              if v is not None and k not in ['timestamp', 'element_id', 'element_type']},
                    "timestamp": metrics.timestamp.isoformat(),
                    "status": metrics.status.value,
                    "type": metrics.element_type.value
                }
            }
            
            await self.sio.emit('telemetry:update', telemetry_data)
            
        except Exception as e:
            logger.error(f"Failed to emit telemetry for {element_id}: {e}")
    
    async def emit_alarm(self, alarm: AlarmData):
        """Emit alarm via WebSocket"""
        if not self.connected or not self.sio:
            logger.debug("WebSocket not connected, skipping alarm emission")
            return
        
        try:
            alarm_data = {
                "id": alarm.id,
                "elementId": alarm.element_id,
                "elementType": alarm.element_type.value,
                "alarmType": alarm.alarm_type,
                "severity": alarm.severity.value,
                "message": alarm.message,
                "isActive": alarm.is_active,
                "isAcknowledged": alarm.is_acknowledged,
                "createdAt": alarm.created_at.isoformat(),
                "thresholdValue": alarm.threshold_value,
                "actualValue": alarm.actual_value
            }
            
            await self.sio.emit('alarm:new', alarm_data)
            logger.info(f"Alarm emitted: {alarm.alarm_type} for {alarm.element_id}")
            
        except Exception as e:
            logger.error(f"Failed to emit alarm: {e}")
    
    async def emit_system_status(self, status_data: dict):
        """Emit system status update"""
        if not self.connected or not self.sio:
            return
        
        try:
            await self.sio.emit('system:status:update', status_data)
        except Exception as e:
            logger.error(f"Failed to emit system status: {e}")
    
    async def disconnect(self):
        """Disconnect from WebSocket server"""
        if self.sio and self.connected:
            await self.sio.disconnect()
            self.connected = False
            logger.info("WebSocket disconnected")


# Alternative HTTP client for fallback communication
class HTTPClient:
    """HTTP client for API communication when WebSocket is unavailable"""
    
    def __init__(self):
        self.base_url = settings.BACKEND_API_URL
        self.auth_token: Optional[str] = None
    
    async def authenticate(self):
        """Authenticate and get access token"""
        try:
            auth_data = {
                "email": "simulator@gridmonitor.com", 
                "password": "simulator_service_key",
                "service": True
            }
            
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.base_url}/api/auth/service-login",
                    json=auth_data,
                    timeout=10
                )
                
                if response.status_code == 200:
                    data = response.json()
                    self.auth_token = data.get("accessToken")
                    return True
                    
        except Exception as e:
            logger.error(f"HTTP authentication error: {e}")
        
        return False
    
    async def submit_telemetry_batch(self, telemetry_batch: list):
        """Submit telemetry data via HTTP API"""
        if not self.auth_token:
            if not await self.authenticate():
                return False
        
        try:
            headers = {"Authorization": f"Bearer {self.auth_token}"}
            
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.base_url}/api/monitoring/telemetry/batch",
                    json={"telemetryData": telemetry_batch},
                    headers=headers,
                    timeout=30
                )
                
                return response.status_code == 200
                
        except Exception as e:
            logger.error(f"HTTP telemetry submission error: {e}")
            return False
    
    async def submit_alarm(self, alarm_data: dict):
        """Submit alarm via HTTP API"""
        if not self.auth_token:
            if not await self.authenticate():
                return False
        
        try:
            headers = {"Authorization": f"Bearer {self.auth_token}"}
            
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.base_url}/api/monitoring/alarms",
                    json=alarm_data,
                    headers=headers,
                    timeout=10
                )
                
                return response.status_code == 200
                
        except Exception as e:
            logger.error(f"HTTP alarm submission error: {e}")
            return False