const { Pool } = require('pg');
const neo4j = require('neo4j-driver');
const redis = require('redis');
const winston = require('winston');

// Configure logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  ],
});

// PostgreSQL connection pool
const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pgPool.on('error', (err) => {
  logger.error('PostgreSQL pool error:', err);
});

pgPool.on('connect', () => {
  logger.info('PostgreSQL client connected');
});

// Neo4j driver
const neo4jDriver = neo4j.driver(
  process.env.NEO4J_URI,
  neo4j.auth.basic(process.env.NEO4J_USER, process.env.NEO4J_PASSWORD),
  {
    maxConnectionPoolSize: 50,
    connectionAcquisitionTimeout: 10000,
    logging: {
      level: 'info',
      logger: (level, message) => logger.log(level, message),
    },
  }
);

// Verify Neo4j connection
neo4jDriver.verifyConnectivity()
  .then(() => logger.info('Neo4j connection verified'))
  .catch((err) => logger.error('Neo4j connection failed:', err));

// Redis client
const redisClient = redis.createClient({
  url: process.env.REDIS_URL,
  socket: {
    reconnectStrategy: (retries) => {
      if (retries > 10) {
        return new Error('Redis reconnection failed');
      }
      return Math.min(retries * 100, 3000);
    },
  },
});

redisClient.on('error', (err) => logger.error('Redis error:', err));
redisClient.on('connect', () => logger.info('Redis connected'));
redisClient.on('ready', () => logger.info('Redis ready'));

// Connect Redis
redisClient.connect().catch((err) => {
  logger.error('Redis connection failed:', err);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Shutting down gracefully...');

  try {
    await pgPool.end();
    await neo4jDriver.close();
    await redisClient.quit();
    logger.info('All connections closed');
    process.exit(0);
  } catch (err) {
    logger.error('Error during shutdown:', err);
    process.exit(1);
  }
});

module.exports = {
  pgPool,
  neo4jDriver,
  redisClient,
  logger,
};