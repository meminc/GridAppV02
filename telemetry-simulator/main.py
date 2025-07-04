# telemetry-simulator/main.py
import asyncio
import signal
import sys
from pathlib import Path
from loguru import logger

from config import settings
from simulator import GridSimulator
from health_server import HealthServer


class TelemetrySimulatorService:
    """Main telemetry simulator service"""
    
    def __init__(self):
        self.simulator = GridSimulator()
        self.health_server = HealthServer(self.simulator)
        self.running = False
    
    async def startup(self):
        """Initialize and start all components"""
        logger.info(f"Starting {settings.SERVICE_NAME}")
        
        try:
            # Initialize simulator
            await self.simulator.initialize()
            
            # Start health check server
            await self.health_server.start_server()
            
            self.running = True
            logger.info("Service startup completed successfully")
            
        except Exception as e:
            logger.error(f"Startup failed: {e}")
            raise
    
    async def shutdown(self):
        """Graceful shutdown of all components"""
        logger.info("Shutting down service...")
        
        try:
            # Stop simulator
            await self.simulator.stop()
            
            # Stop health server
            await self.health_server.stop_server()
            
            self.running = False
            logger.info("Service shutdown completed")
            
        except Exception as e:
            logger.error(f"Shutdown error: {e}")
    
    async def run(self):
        """Main service loop"""
        await self.startup()
        
        try:
            # Run simulator
            await self.simulator.run()
            
        except Exception as e:
            logger.error(f"Service error: {e}")
        finally:
            await self.shutdown()


def setup_logging():
    """Configure logging"""
    # Remove default logger
    logger.remove()
    
    # Add console logger with colors
    logger.add(
        sys.stderr,
        level=settings.LOG_LEVEL,
        format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | "
               "<level>{level: <8}</level> | "
               "<cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> | "
               "<level>{message}</level>",
        colorize=True
    )
    
    # Add file logger
    log_dir = Path("logs")
    log_dir.mkdir(exist_ok=True)
    
    logger.add(
        log_dir / "simulator.log",
        level="DEBUG",
        format="{time:YYYY-MM-DD HH:mm:ss} | {level: <8} | {name}:{function}:{line} | {message}",
        rotation="100 MB",
        retention="30 days",
        compression="gz"
    )
    
    # Add error log
    logger.add(
        log_dir / "errors.log",
        level="ERROR",
        format="{time:YYYY-MM-DD HH:mm:ss} | {level: <8} | {name}:{function}:{line} | {message}",
        rotation="50 MB",
        retention="90 days"
    )


def setup_signal_handlers(service):
    """Setup signal handlers for graceful shutdown"""
    
    def signal_handler(signum, frame):
        logger.info(f"Received signal {signum}, initiating shutdown...")
        
        # Create shutdown task
        loop = asyncio.get_event_loop()
        if loop.is_running():
            loop.create_task(service.shutdown())
        else:
            asyncio.run(service.shutdown())
        
        sys.exit(0)
    
    # Register signal handlers
    signal.signal(signal.SIGINT, signal_handler)   # Ctrl+C
    signal.signal(signal.SIGTERM, signal_handler)  # Docker stop
    
    if hasattr(signal, 'SIGHUP'):
        signal.signal(signal.SIGHUP, signal_handler)  # Reload signal


async def main():
    """Main entry point"""
    setup_logging()
    
    logger.info("=" * 60)
    logger.info(f"Starting {settings.SERVICE_NAME}")
    logger.info("=" * 60)
    logger.info(f"Configuration:")
    logger.info(f"  Update Interval: {settings.UPDATE_INTERVAL}s")
    logger.info(f"  Health Port: {settings.HEALTH_CHECK_PORT}")
    logger.info(f"  Log Level: {settings.LOG_LEVEL}")
    logger.info(f"  PostgreSQL: {settings.POSTGRES_URL.split('@')[1] if '@' in settings.POSTGRES_URL else 'N/A'}")
    logger.info(f"  Neo4j: {settings.NEO4J_URL}")
    logger.info(f"  Backend: {settings.BACKEND_API_URL}")
    logger.info("=" * 60)
    
    # Create service instance
    service = TelemetrySimulatorService()
    
    # Setup signal handlers
    setup_signal_handlers(service)
    
    try:
        # Run the service
        await service.run()
        
    except KeyboardInterrupt:
        logger.info("Received keyboard interrupt")
    except Exception as e:
        logger.error(f"Unhandled exception: {e}")
        raise
    finally:
        if service.running:
            await service.shutdown()


if __name__ == "__main__":
    # Check Python version
    if sys.version_info < (3, 8):
        print("Error: Python 3.8 or higher is required")
        sys.exit(1)
    
    try:
        # Run the main async function
        print("HELLO CANO")
        asyncio.run(main())
    except Exception as e:
        logger.error(f"Failed to start service: {e}")
        sys.exit(1)