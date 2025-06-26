const bcrypt = require('bcrypt');
const { pgPool } = require('../config/database');

class UserService {
    async createUser(userData) {
        const { email, password, firstName, lastName, role = 'operator' } = userData;

        // Check if user exists
        const existing = await pgPool.query(
            'SELECT id FROM auth.users WHERE email = $1',
            [email]
        );

        if (existing.rows.length > 0) {
            throw new Error('User already exists');
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, 10);

        // Create user
        const result = await pgPool.query(
            `INSERT INTO auth.users (email, password_hash, first_name, last_name, role) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING id, email, first_name, last_name, role, created_at`,
            [email, passwordHash, firstName, lastName, role]
        );

        return result.rows[0];
    }

    async updateUser(userId, updates) {
        const allowedFields = ['first_name', 'last_name', 'role', 'is_active'];
        const updateFields = [];
        const values = [];
        let paramCount = 1;

        Object.keys(updates).forEach((key) => {
            if (allowedFields.includes(key)) {
                updateFields.push(`${key} = $${paramCount}`);
                values.push(updates[key]);
                paramCount++;
            }
        });

        if (updateFields.length === 0) {
            throw new Error('No valid fields to update');
        }

        values.push(userId);

        const result = await pgPool.query(
            `UPDATE auth.users 
       SET ${updateFields.join(', ')}, updated_at = NOW() 
       WHERE id = $${paramCount} 
       RETURNING id, email, first_name, last_name, role, is_active`,
            values
        );

        if (result.rows.length === 0) {
            throw new Error('User not found');
        }

        return result.rows[0];
    }

    async changePassword(userId, oldPassword, newPassword) {
        // Get user
        const userResult = await pgPool.query(
            'SELECT password_hash FROM auth.users WHERE id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) {
            throw new Error('User not found');
        }

        // Verify old password
        const isValid = await bcrypt.compare(oldPassword, userResult.rows[0].password_hash);
        if (!isValid) {
            throw new Error('Invalid current password');
        }

        // Hash new password
        const newPasswordHash = await bcrypt.hash(newPassword, 10);

        // Update password
        await pgPool.query(
            'UPDATE auth.users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
            [newPasswordHash, userId]
        );

        return { message: 'Password changed successfully' };
    }

    async listUsers(filters = {}) {
        let query = `
      SELECT id, email, first_name, last_name, role, is_active, created_at, updated_at 
      FROM auth.users 
      WHERE 1=1
    `;
        const values = [];
        let paramCount = 1;

        if (filters.role) {
            query += ` AND role = $${paramCount}`;
            values.push(filters.role);
            paramCount++;
        }

        if (filters.isActive !== undefined) {
            query += ` AND is_active = $${paramCount}`;
            values.push(filters.isActive);
            paramCount++;
        }

        query += ' ORDER BY created_at DESC';

        const result = await pgPool.query(query, values);
        return result.rows;
    }

    async deleteUser(userId) {
        const result = await pgPool.query(
            'DELETE FROM auth.users WHERE id = $1 RETURNING id',
            [userId]
        );

        if (result.rows.length === 0) {
            throw new Error('User not found');
        }

        return { message: 'User deleted successfully' };
    }
}

module.exports = new UserService();