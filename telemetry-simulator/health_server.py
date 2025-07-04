# telemetry-simulator/health_server.py
import asyncio
from datetime import datetime
from aiohttp import web, hdrs
from aiohttp.web_response import Response
import json
from loguru import logger

from config import settings
from models import HealthStatus
from database import db_manager


class HealthServer:
    """HTTP server for health checks and monitoring"""
    
    def __init__(self, simulator):
        self.simulator = simulator
        self.app = web.Application()
        self.runner = None
        self.site = None
        self.start_time = datetime.now()
        
        # Setup routes
        self._setup_routes()
    
    def _setup_routes(self):
        """Setup HTTP routes"""
        self.app.router.add_get('/health', self.health_check)
        self.app.router.add_get('/metrics', self.get_metrics)
        self.app.router.add_get('/status', self.get_status)
        self.app.router.add_post('/control/start', self.start_simulation)
        self.app.router.add_post('/control/stop', self.stop_simulation)
        self.app.router.add_get('/', self.root)
    
    async def health_check(self, request):
        """Health check endpoint"""
        try:
            # Check database connections
            db_health = await db_manager.health_check()
            
            # Get simulator state
            simulator_state = self.simulator.get_state()
            
            # Calculate uptime
            uptime = (datetime.now() - self.start_time).total_seconds()
            
            # Determine overall health
            all_db_healthy = all(
                db["status"] == "healthy" 
                for db in db_health.values()
            )
            
            overall_status = "healthy" if all_db_healthy and simulator_state.is_running else "unhealthy"
            
            health_data = HealthStatus(
                status=overall_status,
                uptime=uptime,
                simulator_state=simulator_state,
                database_connections={
                    name: info["status"] == "healthy"
                    for name, info in db_health.items()
                }
            )
            
            status_code = 200 if overall_status == "healthy" else 503
            
            return web.json_response(
                health_data.dict(),
                status=status_code,
                headers={"Content-Type": "application/json"}
            )
            
        except Exception as e:
            logger.error(f"Health check error: {e}")
            return web.json_response(
                {
                    "status": "error",
                    "timestamp": datetime.now().isoformat(),
                    "error": str(e)
                },
                status=500
            )
    
    async def get_metrics(self, request):
        """Prometheus-style metrics endpoint"""
        try:
            simulator_state = self.simulator.get_state()
            uptime = (datetime.now() - self.start_time).total_seconds()
            
            metrics = [
                f"# HELP simulator_uptime_seconds Total uptime in seconds",
                f"# TYPE simulator_uptime_seconds counter",
                f"simulator_uptime_seconds {uptime}",
                f"",
                f"# HELP simulator_updates_total Total simulation updates",
                f"# TYPE simulator_updates_total counter", 
                f"simulator_updates_total {simulator_state.update_count}",
                f"",
                f"# HELP simulator_errors_total Total simulation errors",
                f"# TYPE simulator_errors_total counter",
                f"simulator_errors_total {simulator_state.error_count}",
                f"",
                f"# HELP simulator_active_elements Current active elements",
                f"# TYPE simulator_active_elements gauge",
                f"simulator_active_elements {simulator_state.active_elements}",
                f"",
                f"# HELP simulator_telemetry_sent_total Total telemetry messages sent",
                f"# TYPE simulator_telemetry_sent_total counter",
                f"simulator_telemetry_sent_total {simulator_state.total_telemetry_sent}",
                f"",
                f"# HELP simulator_alarms_generated_total Total alarms generated", 
                f"# TYPE simulator_alarms_generated_total counter",
                f"simulator_alarms_generated_total {simulator_state.total_alarms_generated}",
                f"",
                f"# HELP simulator_avg_update_time_seconds Average update cycle time",
                f"# TYPE simulator_avg_update_time_seconds gauge", 
                f"simulator_avg_update_time_seconds {simulator_state.avg_update_time}",
            ]
            
            return Response(
                text="\n".join(metrics),
                content_type="text/plain",
                charset="utf-8"
            )
            
        except Exception as e:
            logger.error(f"Metrics error: {e}")
            return web.json_response({"error": str(e)}, status=500)
    
    async def get_status(self, request):
        """Detailed status endpoint"""
        try:
            simulator_state = self.simulator.get_state()
            db_health = await db_manager.health_check()
            uptime = (datetime.now() - self.start_time).total_seconds()
            
            status_data = {
                "service": {
                    "name": settings.SERVICE_NAME,
                    "version": "1.0.0",
                    "uptime": uptime,
                    "start_time": self.start_time.isoformat()
                },
                "simulator": {
                    "running": simulator_state.is_running,
                    "active_elements": simulator_state.active_elements,
                    "update_count": simulator_state.update_count,
                    "error_count": simulator_state.error_count,
                    "last_update": simulator_state.last_update.isoformat() if simulator_state.last_update else None,
                    "avg_update_time": simulator_state.avg_update_time,
                    "telemetry_sent": simulator_state.total_telemetry_sent,
                    "alarms_generated": simulator_state.total_alarms_generated
                },
                "databases": db_health,
                "configuration": {
                    "update_interval": settings.UPDATE_INTERVAL,
                    "batch_size": settings.BATCH_SIZE,
                    "daily_load_curve": settings.DAILY_LOAD_CURVE,
                    "weather_effects": settings.WEATHER_EFFECTS
                }
            }
            
            return web.json_response(status_data)
            
        except Exception as e:
            logger.error(f"Status error: {e}")
            return web.json_response({"error": str(e)}, status=500)
    
    async def start_simulation(self, request):
        """Start simulation endpoint"""
        try:
            if not self.simulator.state.is_running:
                # Start simulation in background task
                asyncio.create_task(self.simulator.run())
                logger.info("Simulation started via API")
                
            return web.json_response({
                "message": "Simulation started",
                "timestamp": datetime.now().isoformat()
            })
            
        except Exception as e:
            logger.error(f"Start simulation error: {e}")
            return web.json_response({"error": str(e)}, status=500)
    
    async def stop_simulation(self, request):
        """Stop simulation endpoint"""
        try:
            await self.simulator.stop()
            logger.info("Simulation stopped via API")
            
            return web.json_response({
                "message": "Simulation stopped", 
                "timestamp": datetime.now().isoformat()
            })
            
        except Exception as e:
            logger.error(f"Stop simulation error: {e}")
            return web.json_response({"error": str(e)}, status=500)
    
    async def root(self, request):
        """Root endpoint with service info"""
        return web.json_response({
            "service": settings.SERVICE_NAME,
            "version": "1.0.0",
            "description": "Grid Telemetry Simulator Service",
            "endpoints": {
                "health": "/health",
                "metrics": "/metrics", 
                "status": "/status",
                "start": "/control/start",
                "stop": "/control/stop"
            },
            "timestamp": datetime.now().isoformat()
        })
    
    async def start_server(self):
        """Start the health check server"""
        try:
            self.runner = web.AppRunner(self.app)
            await self.runner.setup()
            
            self.site = web.TCPSite(
                self.runner, 
                '0.0.0.0', 
                settings.HEALTH_CHECK_PORT
            )
            await self.site.start()
            
            logger.info(f"Health server started on port {settings.HEALTH_CHECK_PORT}")
            
        except Exception as e:
            logger.error(f"Failed to start health server: {e}")
    
    async def stop_server(self):
        """Stop the health check server"""
        try:
            if self.site:
                await self.site.stop()
            
            if self.runner:
                await self.runner.cleanup()
            
            logger.info("Health server stopped")
            
        except Exception as e:
            logger.error(f"Error stopping health server: {e}")