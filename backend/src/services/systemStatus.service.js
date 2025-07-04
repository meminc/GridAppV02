// backend/src/services/systemStatus.service.js - NEW FILE

const { pgPool, neo4jDriver, redisClient, logger } = require('../config/database');
const { getConnectedUsers } = require('./websocket');

class SystemStatusService {
    constructor() {
        this.lastHealthCheck = null;
        this.healthCheckInterval = 30000; // 30 seconds
        this.performanceMetrics = new Map();
    }

    async getSystemHealth() {
        try {
            const health = {
                timestamp: new Date().toISOString(),
                overall: 'healthy',
                services: {},
                metrics: {},
                alerts: [],
            };

            // Check database connections
            health.services.postgresql = await this.checkPostgreSQL();
            health.services.neo4j = await this.checkNeo4j();
            health.services.redis = await this.checkRedis();

            // Get system metrics
            health.metrics = await this.getSystemMetrics();

            // Calculate overall health
            const serviceStatuses = Object.values(health.services);
            const healthyServices = serviceStatuses.filter(s => s.status === 'healthy').length;
            const healthPercentage = (healthyServices / serviceStatuses.length) * 100;

            if (healthPercentage >= 100) {
                health.overall = 'healthy';
            } else if (healthPercentage >= 70) {
                health.overall = 'degraded';
            } else {
                health.overall = 'unhealthy';
            }

            // Add alerts for unhealthy services
            serviceStatuses.forEach(service => {
                if (service.status !== 'healthy') {
                    health.alerts.push({
                        type: 'service_issue',
                        severity: service.status === 'down' ? 'critical' : 'warning',
                        message: `${service.name} is ${service.status}`,
                        timestamp: new Date().toISOString(),
                    });
                }
            });

            this.lastHealthCheck = health;
            return health;
        } catch (error) {
            logger.error('Health check failed:', error);
            return {
                timestamp: new Date().toISOString(),
                overall: 'unhealthy',
                error: error.message,
                services: {},
                metrics: {},
                alerts: [{
                    type: 'system_error',
                    severity: 'critical',
                    message: 'Health check system failure',
                    timestamp: new Date().toISOString(),
                }],
            };
        }
    }

    async checkPostgreSQL() {
        try {
            const start = Date.now();
            const result = await pgPool.query('SELECT 1 as test');
            const responseTime = Date.now() - start;

            const poolStats = {
                totalCount: pgPool.totalCount,
                idleCount: pgPool.idleCount,
                waitingCount: pgPool.waitingCount,
            };

            return {
                name: 'PostgreSQL',
                status: 'healthy',
                responseTime,
                details: poolStats,
                lastCheck: new Date().toISOString(),
            };
        } catch (error) {
            return {
                name: 'PostgreSQL',
                status: 'down',
                error: error.message,
                lastCheck: new Date().toISOString(),
            };
        }
    }

    async checkNeo4j() {
        const session = neo4jDriver.session();
        try {
            const start = Date.now();
            await session.run('RETURN 1 as test');
            const responseTime = Date.now() - start;

            return {
                name: 'Neo4j',
                status: 'healthy',
                responseTime,
                lastCheck: new Date().toISOString(),
            };
        } catch (error) {
            return {
                name: 'Neo4j',
                status: 'down',
                error: error.message,
                lastCheck: new Date().toISOString(),
            };
        } finally {
            await session.close();
        }
    }

    async checkRedis() {
        try {
            const start = Date.now();
            await redisClient.ping();
            const responseTime = Date.now() - start;

            return {
                name: 'Redis',
                status: 'healthy',
                responseTime,
                lastCheck: new Date().toISOString(),
            };
        } catch (error) {
            return {
                name: 'Redis',
                status: 'down',
                error: error.message,
                lastCheck: new Date().toISOString(),
            };
        }
    }

    async getSystemMetrics() {
        try {
            const metrics = {
                timestamp: new Date().toISOString(),
            };

            // WebSocket connections
            const connectedUsers = getConnectedUsers();
            metrics.connections = {
                activeUsers: connectedUsers.size,
                totalSockets: connectedUsers.size,
            };

            // Database metrics
            metrics.database = await this.getDatabaseMetrics();

            // Grid topology metrics
            metrics.topology = await this.getTopologyMetrics();

            // Performance metrics
            metrics.performance = this.getPerformanceMetrics();

            return metrics;
        } catch (error) {
            logger.error('Failed to get system metrics:', error);
            return {
                timestamp: new Date().toISOString(),
                error: error.message,
            };
        }
    }

    async getDatabaseMetrics() {
        try {
            // PostgreSQL metrics
            const pgMetrics = await pgPool.query(`
                SELECT 
                    count(*) as total_connections,
                    sum(case when state = 'active' then 1 else 0 end) as active_connections
                FROM pg_stat_activity 
                WHERE datname = current_database()
            `);

            // Get telemetry data volume
            const telemetryCount = await pgPool.query(`
                SELECT count(*) as total_telemetry
                FROM monitoring.telemetry 
                WHERE time >= NOW() - INTERVAL '1 hour'
            `);

            return {
                postgresql: {
                    connections: pgMetrics.rows[0],
                    recentTelemetry: parseInt(telemetryCount.rows[0].total_telemetry),
                },
            };
        } catch (error) {
            logger.error('Database metrics error:', error);
            return { error: error.message };
        }
    }

    async getTopologyMetrics() {
        const session = neo4jDriver.session();
        try {
            const result = await session.run(`
                MATCH (n:Element)
                WITH count(n) as totalElements,
                     sum(case when n.status = 'active' then 1 else 0 end) as activeElements
                MATCH (g:Generator) WHERE g.status = 'active'
                WITH totalElements, activeElements, 
                     sum(coalesce(g.output, 0)) as totalGeneration,
                     sum(coalesce(g.capacity, 0)) as totalCapacity
                MATCH (l:Load) WHERE l.status = 'active'
                RETURN totalElements, activeElements, totalGeneration, totalCapacity,
                       sum(coalesce(l.demand, 0)) as totalLoad
            `);

            const data = result.records[0];
            return {
                elements: {
                    total: data.get('totalElements').toNumber(),
                    active: data.get('activeElements').toNumber(),
                },
                power: {
                    generation: data.get('totalGeneration') || 0,
                    capacity: data.get('totalCapacity') || 0,
                    load: data.get('totalLoad') || 0,
                },
            };
        } catch (error) {
            logger.error('Topology metrics error:', error);
            return { error: error.message };
        } finally {
            await session.close();
        }
    }

    getPerformanceMetrics() {
        const now = Date.now();

        // Clean old metrics (keep last hour)
        const oneHourAgo = now - (60 * 60 * 1000);
        for (const [timestamp] of this.performanceMetrics) {
            if (timestamp < oneHourAgo) {
                this.performanceMetrics.delete(timestamp);
            }
        }

        // Calculate averages
        const metrics = Array.from(this.performanceMetrics.values());
        const avgResponseTime = metrics.length > 0 ?
            metrics.reduce((sum, m) => sum + (m.responseTime || 0), 0) / metrics.length : 0;

        return {
            responseTime: {
                average: Math.round(avgResponseTime),
                samples: metrics.length,
            },
            memory: process.memoryUsage(),
            uptime: process.uptime(),
        };
    }

    recordPerformanceMetric(responseTime) {
        const timestamp = Date.now();
        this.performanceMetrics.set(timestamp, {
            responseTime,
            timestamp,
        });
    }

    async getDetailedStatus() {
        const health = await this.getSystemHealth();

        // Add more detailed information
        const detailed = {
            ...health,
            system: {
                nodeVersion: process.version,
                platform: process.platform,
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                pid: process.pid,
            },
            environment: {
                nodeEnv: process.env.NODE_ENV,
                port: process.env.PORT,
            },
        };

        return detailed;
    }

    startHealthMonitoring() {
        // Perform initial health check
        this.getSystemHealth();

        // Set up periodic health checks
        setInterval(async () => {
            try {
                await this.getSystemHealth();
            } catch (error) {
                logger.error('Periodic health check failed:', error);
            }
        }, this.healthCheckInterval);

        logger.info('System health monitoring started');
    }
}

module.exports = new SystemStatusService();