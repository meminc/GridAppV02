# telemetry-simulator/database.py
import asyncio
import asyncpg
import redis.asyncio as redis
from neo4j import AsyncGraphDatabase
from typing import List, Dict, Any, Optional
from loguru import logger
from config import settings
from models import GridElement, TelemetryMetrics, AlarmData


class DatabaseManager:
    """Manages connections to PostgreSQL, Neo4j, and Redis"""
    
    def __init__(self):
        self.pg_pool: Optional[asyncpg.Pool] = None
        self.neo4j_driver = None
        self.redis_client: Optional[redis.Redis] = None
        self._connection_status = {
            "postgresql": False,
            "neo4j": False,
            "redis": False
        }
    
    async def initialize(self):
        """Initialize all database connections"""
        await self._connect_postgresql()
        await self._connect_neo4j()
        await self._connect_redis()
        logger.info("Database connections initialized")
    
    async def _connect_postgresql(self):
        """Connect to PostgreSQL with TimescaleDB"""
        try:
            self.pg_pool = await asyncpg.create_pool(
                settings.POSTGRES_URL,
                min_size=2,
                max_size=10,
                command_timeout=30
            )

            
            
            # Test connection
            async with self.pg_pool.acquire() as conn:
                await conn.fetchval("SELECT 1")
            
            self._connection_status["postgresql"] = True
            logger.info("PostgreSQL connection established")
            
        except Exception as e:
            logger.error(f"PostgreSQL connection failed: {e}")
            self._connection_status["postgresql"] = False
    
    async def _connect_neo4j(self):
        """Connect to Neo4j graph database"""
        try:
            self.neo4j_driver = AsyncGraphDatabase.driver(
                settings.NEO4J_URL,
                auth=(settings.NEO4J_USER, settings.NEO4J_PASSWORD),
                max_connection_lifetime=3600,
                max_connection_pool_size=50,
                connection_acquisition_timeout=30
            )
            
            # Test connection
            async with self.neo4j_driver.session() as session:
                await session.run("RETURN 1")
            
            self._connection_status["neo4j"] = True
            logger.info("Neo4j connection established")
            
        except Exception as e:
            logger.error(f"Neo4j connection failed: {e}")
            self._connection_status["neo4j"] = False
    
    async def _connect_redis(self):
        """Connect to Redis cache"""
        try:
            self.redis_client = redis.from_url(
                settings.REDIS_URL,
                decode_responses=True,
                socket_connect_timeout=10,
                socket_timeout=10
            )
            
            # Test connection
            await self.redis_client.ping()
            
            self._connection_status["redis"] = True
            logger.info("Redis connection established")
            
        except Exception as e:
            logger.error(f"Redis connection failed: {e}")
            self._connection_status["redis"] = False
    
    async def get_grid_elements(self) -> List[GridElement]:
        """Fetch all grid elements from Neo4j"""
        if not self._connection_status["neo4j"]:
            logger.warning("Neo4j not connected, returning empty elements list")
            return []
        
        elements = []
        async with self.neo4j_driver.session() as session:
            try:
                result = await session.run("""
                    MATCH (n:Element)
                    RETURN n.id as id, n.name as name, labels(n) as labels, 
                           properties(n) as properties
                    ORDER BY n.name
                """)
                
                async for record in result:
                    labels = record["labels"]
                    element_type = next((label for label in labels if label != "Element"), "Unknown")
                    
                    properties = dict(record["properties"])
                    
                    element = GridElement(
                        id=record["id"],
                        name=record["name"],
                        element_type=element_type,
                        properties=properties,
                        voltage_level=properties.get("voltage_level"),
                        capacity=properties.get("capacity"),
                        output=properties.get("output"),
                        demand=properties.get("demand"),
                        rating=properties.get("rating"),
                        resistance=properties.get("resistance"),
                        reactance=properties.get("reactance"),
                        tap_ratio=properties.get("tap_ratio"),
                    )
                    elements.append(element)
                
                logger.info(f"Loaded {len(elements)} grid elements from Neo4j")
                
            except Exception as e:
                logger.error(f"Failed to fetch grid elements: {e}")
        
        return elements
    
    async def store_telemetry(self, metrics: TelemetryMetrics):
        """Store telemetry data in PostgreSQL TimescaleDB"""
        if not self._connection_status["postgresql"]:
            logger.warning("PostgreSQL not connected, skipping telemetry storage")
            return
        
        async with self.pg_pool.acquire() as conn:
            try:
                # Convert metrics to individual measurements
                measurements = []
                for field, value in metrics.dict().items():
                    if value is not None and field not in ['timestamp', 'element_id', 'element_type', 'status']:
                        measurements.append((
                            metrics.timestamp,
                            metrics.element_id,
                            metrics.element_type.value,
                            field,
                            float(value) if isinstance(value, (int, float)) else str(value)
                        ))
                
                if measurements:
                    await conn.executemany("""
                        INSERT INTO monitoring.telemetry 
                        (time, element_id, element_type, metric_name, metric_value)
                        VALUES ($1, $2, $3, $4, $5)
                    """, measurements)
                
            except Exception as e:
                logger.error(f"Failed to store telemetry for {metrics.element_id}: {e}")
    
    async def store_telemetry_batch(self, metrics_list: List[TelemetryMetrics]):
        """Store multiple telemetry measurements in batch"""
        if not self._connection_status["postgresql"] or not metrics_list:
            return
        
        async with self.pg_pool.acquire() as conn:
            try:
                all_measurements = []
                for metrics in metrics_list:
                    for field, value in metrics.dict().items():
                        if value is not None and field not in ['timestamp', 'element_id', 'element_type', 'status']:
                            all_measurements.append((
                                metrics.timestamp,
                                metrics.element_id,
                                metrics.element_type.value,
                                field,
                                float(value) if isinstance(value, (int, float)) else str(value)
                            ))
                
                if all_measurements:
                    await conn.executemany("""
                        INSERT INTO monitoring.telemetry 
                        (time, element_id, element_type, metric_name, metric_value)
                        VALUES ($1, $2, $3, $4, $5)
                    """, all_measurements)
                    
                    logger.debug(f"Stored {len(all_measurements)} telemetry measurements")
                
            except Exception as e:
                logger.error(f"Failed to store telemetry batch: {e}")
    
    async def store_alarm(self, alarm: AlarmData):
        """Store alarm in PostgreSQL"""
        if not self._connection_status["postgresql"]:
            logger.warning("PostgreSQL not connected, skipping alarm storage")
            return
        
        async with self.pg_pool.acquire() as conn:
            try:
                await conn.execute("""
                    INSERT INTO monitoring.alarms 
                    (id, element_id, element_type, alarm_type, severity, message, 
                     is_active, is_acknowledged, created_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                """, 
                alarm.id, alarm.element_id, alarm.element_type.value,
                alarm.alarm_type, alarm.severity.value, alarm.message,
                alarm.is_active, alarm.is_acknowledged, alarm.created_at)
                
                logger.info(f"Stored alarm: {alarm.alarm_type} for {alarm.element_id}")
                
            except Exception as e:
                logger.error(f"Failed to store alarm: {e}")
    
    async def cache_latest_telemetry(self, element_id: str, metrics: TelemetryMetrics):
        """Cache latest telemetry in Redis for quick access"""
        if not self._connection_status["redis"]:
            return
        
        try:
            cache_key = f"telemetry:{element_id}"
            cache_data = {
                "timestamp": metrics.timestamp.isoformat(),
                "status": metrics.status.value,
                **{k: v for k, v in metrics.dict().items() 
                   if v is not None and k not in ['timestamp', 'element_id', 'element_type', 'status']}
            }
            
            await self.redis_client.hset(cache_key, mapping=cache_data)
            await self.redis_client.expire(cache_key, 3600)  # 1 hour TTL
            
        except Exception as e:
            logger.error(f"Failed to cache telemetry for {element_id}: {e}")
    
    async def get_connection_status(self) -> Dict[str, bool]:
        """Get status of all database connections"""
        return self._connection_status.copy()
    
    async def health_check(self) -> Dict[str, Any]:
        """Perform health check on all connections"""
        health = {}
        
        # Test PostgreSQL
        try:
            if self.pg_pool:
                async with self.pg_pool.acquire() as conn:
                    await conn.fetchval("SELECT 1")
                health["postgresql"] = {"status": "healthy", "latency_ms": 0}
            else:
                health["postgresql"] = {"status": "disconnected"}
        except Exception as e:
            health["postgresql"] = {"status": "unhealthy", "error": str(e)}
        
        # Test Neo4j
        try:
            if self.neo4j_driver:
                async with self.neo4j_driver.session() as session:
                    await session.run("RETURN 1")
                health["neo4j"] = {"status": "healthy", "latency_ms": 0}
            else:
                health["neo4j"] = {"status": "disconnected"}
        except Exception as e:
            health["neo4j"] = {"status": "unhealthy", "error": str(e)}
        
        # Test Redis
        try:
            if self.redis_client:
                await self.redis_client.ping()
                health["redis"] = {"status": "healthy", "latency_ms": 0}
            else:
                health["redis"] = {"status": "disconnected"}
        except Exception as e:
            health["redis"] = {"status": "unhealthy", "error": str(e)}
        
        return health
    
    async def close(self):
        """Close all database connections"""
        if self.pg_pool:
            await self.pg_pool.close()
        
        if self.neo4j_driver:
            await self.neo4j_driver.close()
        
        if self.redis_client:
            await self.redis_client.close()
        
        logger.info("Database connections closed")


# Global database manager instance
db_manager = DatabaseManager()