const { pgPool, redisClient } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class SessionService {
    async createSession(userId, req) {
        const sessionId = uuidv4();
        const sessionData = {
            userId,
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.headers['user-agent'],
            createdAt: new Date().toISOString(),
            lastActivity: new Date().toISOString(),
        };

        // Store in Redis with 24-hour TTL
        await redisClient.setex(
            `session:${sessionId}`,
            86400, // 24 hours
            JSON.stringify(sessionData)
        );

        // Also store in PostgreSQL for audit
        await pgPool.query(
            `INSERT INTO auth.sessions (id, user_id, ip_address, user_agent)
       VALUES ($1, $2, $3, $4)`,
            [sessionId, userId, sessionData.ipAddress, sessionData.userAgent]
        );

        return sessionId;
    }

    async getSession(sessionId) {
        const sessionData = await redisClient.get(`session:${sessionId}`);

        if (!sessionData) {
            return null;
        }

        // Update last activity
        const session = JSON.parse(sessionData);
        session.lastActivity = new Date().toISOString();

        await redisClient.setex(
            `session:${sessionId}`,
            86400,
            JSON.stringify(session)
        );

        // Update in PostgreSQL
        await pgPool.query(
            'UPDATE auth.sessions SET last_activity = NOW() WHERE id = $1',
            [sessionId]
        );

        return session;
    }

    async getUserSessions(userId) {
        const result = await pgPool.query(
            `SELECT id, ip_address, user_agent, last_activity, created_at
       FROM auth.sessions
       WHERE user_id = $1
       AND last_activity > NOW() - INTERVAL '24 hours'
       ORDER BY last_activity DESC`,
            [userId]
        );

        return result.rows;
    }

    async revokeSession(sessionId) {
        await redisClient.del(`session:${sessionId}`);

        await pgPool.query(
            'DELETE FROM auth.sessions WHERE id = $1',
            [sessionId]
        );
    }

    async revokeAllUserSessions(userId) {
        // Get all user sessions from PostgreSQL
        const sessions = await this.getUserSessions(userId);

        // Delete from Redis
        for (const session of sessions) {
            await redisClient.del(`session:${session.id}`);
        }

        // Delete from PostgreSQL
        await pgPool.query(
            'DELETE FROM auth.sessions WHERE user_id = $1',
            [userId]
        );
    }

    async cleanupExpiredSessions() {
        // Clean up PostgreSQL sessions older than 24 hours
        await pgPool.query(
            'DELETE FROM auth.sessions WHERE last_activity < NOW() - INTERVAL \'24 hours\''
        );
    }
}

module.exports = new SessionService();