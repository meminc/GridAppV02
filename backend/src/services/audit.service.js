const { pgPool, logger } = require('../config/database');

class AuditService {
    async log(action, userId, entityType, entityId, changes = {}) {
        try {
            await pgPool.query(
                `INSERT INTO auth.audit_logs (action, user_id, entity_type, entity_id, changes, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
                [action, userId, entityType, entityId, JSON.stringify(changes)]
            );
        } catch (error) {
            logger.error('Audit log failed:', error);
            // Don't throw - audit failures shouldn't break the main flow
        }
    }

    async getAuditLogs(filters = {}) {
        let query = `
      SELECT 
        al.*, 
        u.email as user_email,
        u.first_name as user_first_name,
        u.last_name as user_last_name
      FROM auth.audit_logs al
      LEFT JOIN auth.users u ON al.user_id = u.id
      WHERE 1=1
    `;
        const values = [];
        let paramCount = 1;

        if (filters.userId) {
            query += ` AND al.user_id = $${paramCount}`;
            values.push(filters.userId);
            paramCount++;
        }

        if (filters.entityType) {
            query += ` AND al.entity_type = $${paramCount}`;
            values.push(filters.entityType);
            paramCount++;
        }

        if (filters.entityId) {
            query += ` AND al.entity_id = $${paramCount}`;
            values.push(filters.entityId);
            paramCount++;
        }

        if (filters.startDate) {
            query += ` AND al.created_at >= $${paramCount}`;
            values.push(filters.startDate);
            paramCount++;
        }

        if (filters.endDate) {
            query += ` AND al.created_at <= $${paramCount}`;
            values.push(filters.endDate);
            paramCount++;
        }

        query += ' ORDER BY al.created_at DESC LIMIT 100';

        const result = await pgPool.query(query, values);
        return result.rows;
    }
}

module.exports = new AuditService();