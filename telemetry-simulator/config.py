# telemetry-simulator/config.py
import os
from typing import Optional
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings with environment variable support"""
    
    # Service Configuration
    SERVICE_NAME: str = "telemetry-simulator"
    LOG_LEVEL: str = "INFO"
    UPDATE_INTERVAL: int = 5  # seconds
    HEALTH_CHECK_PORT: int = 8080
    
    # Database Connections
    POSTGRES_URL: str = "postgresql://grid_user:grid_password@localhost:5430/grid_monitoring"
    NEO4J_URL: str = "bolt://localhost:7687"
    NEO4J_USER: str = "neo4j"
    NEO4J_PASSWORD: str = "grid_password"
    REDIS_URL: str = "redis://:grid_redis_password@localhost:6379"
    
    # Backend API
    BACKEND_API_URL: str = "http://localhost:3001"
    BACKEND_WS_URL: str = "ws://localhost:3001"
    
    # Simulation Parameters
    VOLTAGE_NOISE_FACTOR: float = 0.02
    FREQUENCY_NOISE_FACTOR: float = 0.002
    POWER_VARIATION_FACTOR: float = 0.1
    ALARM_PROBABILITY: float = 0.001  # Probability of generating alarms
    
    # Grid Scenarios
    DAILY_LOAD_CURVE: bool = True
    SEASONAL_VARIATION: bool = True
    WEATHER_EFFECTS: bool = True
    
    # Performance Settings
    BATCH_SIZE: int = 100
    MAX_RETRIES: int = 3
    RETRY_DELAY: int = 5
    
    class Config:
        env_file = ".env"
        case_sensitive = True


# Global settings instance
settings = Settings()