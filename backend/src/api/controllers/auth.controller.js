const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { pgPool } = require('../../config/database');
const auditService = require('../../services/audit.service');
const emailService = require('../../services/email.service');

const generateToken = (user, expiresIn = process.env.JWT_EXPIRES_IN || '7d') => {
    return jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn }
    );
};

const generateRefreshToken = () => {
    return crypto.randomBytes(32).toString('hex');
};

const login = async (req, res, next) => {
    try {
        const { email, password } = req.body;

        // Find user
        const result = await pgPool.query(
            'SELECT * FROM auth.users WHERE email = $1 AND is_active = true',
            [email]
        );

        if (result.rows.length === 0) {
            await auditService.log('LOGIN_FAILED', null, 'user', null, { email, reason: 'User not found' });
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = result.rows[0];

        // Check password
        const isValidPassword = await bcrypt.compare(password, user.password_hash);
        if (!isValidPassword) {
            await auditService.log('LOGIN_FAILED', user.id, 'user', user.id, { reason: 'Invalid password' });
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Generate tokens
        const accessToken = generateToken(user);
        const refreshToken = generateRefreshToken();

        // Store refresh token
        await pgPool.query(
            `INSERT INTO auth.refresh_tokens (user_id, token, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '30 days')`,
            [user.id, refreshToken]
        );

        // Update last login
        await pgPool.query(
            'UPDATE auth.users SET last_login_at = NOW() WHERE id = $1',
            [user.id]
        );

        // Log successful login
        await auditService.log('LOGIN_SUCCESS', user.id, 'user', user.id, { ip: req.ip });

        res.json({
            accessToken,
            refreshToken,
            user: {
                id: user.id,
                email: user.email,
                firstName: user.first_name,
                lastName: user.last_name,
                role: user.role,
            },
        });
    } catch (error) {
        next(error);
    }
};

const serviceLogin = async (req, res, next) => {
    try {
        const { email, password, service } = req.body;

        // Validate service credentials
        if (!service || email !== 'simulator@gridmonitor.com') {
            return res.status(401).json({ error: 'Invalid service credentials' });
        }

        // Check service password (in production, use proper service key validation)
        const validServiceKey = process.env.SIMULATOR_SERVICE_KEY || 'simulator_service_key';
        if (password !== validServiceKey) {
            await auditService.log('SERVICE_LOGIN_FAILED', null, 'service', email, { reason: 'Invalid service key' });
            return res.status(401).json({ error: 'Invalid service credentials' });
        }

        // Create service user token
        const serviceUser = {
            id: 'service-simulator',
            email: email,
            role: 'service',
            service: true
        };

        // Generate longer-lived token for services
        const accessToken = generateToken(serviceUser, '30d'); // 30 days for services

        // Log successful service login
        await auditService.log('SERVICE_LOGIN_SUCCESS', serviceUser.id, 'service', serviceUser.id, { service: 'telemetry-simulator' });

        res.json({
            accessToken,
            user: serviceUser,
            service: true
        });
    } catch (error) {
        next(error);
    }
};

const register = async (req, res, next) => {
    try {
        const { email, password, firstName, lastName } = req.body;

        // Check if user exists
        const existingUser = await pgPool.query(
            'SELECT id FROM auth.users WHERE email = $1',
            [email]
        );

        if (existingUser.rows.length > 0) {
            return res.status(400).json({ error: 'User already exists' });
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, 10);
        const verificationToken = crypto.randomBytes(32).toString('hex');

        // Create user
        const result = await pgPool.query(
            `INSERT INTO auth.users (email, password_hash, first_name, last_name, verification_token) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING id, email, first_name, last_name, role`,
            [email, passwordHash, firstName, lastName, verificationToken]
        );

        const user = result.rows[0];

        // Generate tokens
        const accessToken = generateToken(user);
        const refreshToken = generateRefreshToken();

        // Store refresh token
        await pgPool.query(
            `INSERT INTO auth.refresh_tokens (user_id, token, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '30 days')`,
            [user.id, refreshToken]
        );

        // Send verification email
        await emailService.sendVerificationEmail(email, verificationToken);

        // Log registration
        await auditService.log('USER_REGISTERED', user.id, 'user', user.id, { email });

        res.status(201).json({
            accessToken,
            refreshToken,
            user: {
                id: user.id,
                email: user.email,
                firstName: user.first_name,
                lastName: user.last_name,
                role: user.role,
            },
        });
    } catch (error) {
        next(error);
    }
};

const refresh = async (req, res, next) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(401).json({ error: 'Refresh token required' });
        }

        // Verify refresh token
        const tokenResult = await pgPool.query(
            `SELECT rt.*, u.* 
       FROM auth.refresh_tokens rt
       JOIN auth.users u ON rt.user_id = u.id
       WHERE rt.token = $1 
       AND rt.expires_at > NOW() 
       AND rt.revoked_at IS NULL
       AND u.is_active = true`,
            [refreshToken]
        );

        if (tokenResult.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid refresh token' });
        }

        const user = tokenResult.rows[0];

        // Generate new access token
        const newAccessToken = generateToken(user);

        // Optionally rotate refresh token
        const newRefreshToken = generateRefreshToken();

        // Revoke old refresh token
        await pgPool.query(
            'UPDATE auth.refresh_tokens SET revoked_at = NOW() WHERE token = $1',
            [refreshToken]
        );

        // Store new refresh token
        await pgPool.query(
            `INSERT INTO auth.refresh_tokens (user_id, token, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '30 days')`,
            [user.id, newRefreshToken]
        );

        res.json({
            accessToken: newAccessToken,
            refreshToken: newRefreshToken,
        });
    } catch (error) {
        next(error);
    }
};

const logout = async (req, res, next) => {
    try {
        const { refreshToken } = req.body;
        const userId = req.user?.id;

        if (refreshToken) {
            // Revoke specific refresh token
            await pgPool.query(
                'UPDATE auth.refresh_tokens SET revoked_at = NOW() WHERE token = $1',
                [refreshToken]
            );
        } else if (userId) {
            // Revoke all user's refresh tokens
            await pgPool.query(
                'UPDATE auth.refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
                [userId]
            );
        }

        // Log logout
        if (userId) {
            await auditService.log('LOGOUT', userId, 'user', userId, {});
        }

        res.json({ message: 'Logged out successfully' });
    } catch (error) {
        next(error);
    }
};

const me = async (req, res, next) => {
    try {
        const userId = req.user.id;

        const result = await pgPool.query(
            `SELECT id, email, first_name, last_name, role, is_active, 
              email_verified, created_at, last_login_at
       FROM auth.users 
       WHERE id = $1`,
            [userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = result.rows[0];

        res.json({
            user: {
                id: user.id,
                email: user.email,
                firstName: user.first_name,
                lastName: user.last_name,
                role: user.role,
                isActive: user.is_active,
                emailVerified: user.email_verified,
                createdAt: user.created_at,
                lastLoginAt: user.last_login_at,
            },
        });
    } catch (error) {
        next(error);
    }
};

const changePassword = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { currentPassword, newPassword } = req.body;

        // Get user
        const userResult = await pgPool.query(
            'SELECT password_hash FROM auth.users WHERE id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Verify current password
        const isValid = await bcrypt.compare(currentPassword, userResult.rows[0].password_hash);
        if (!isValid) {
            await auditService.log('PASSWORD_CHANGE_FAILED', userId, 'user', userId, { reason: 'Invalid current password' });
            return res.status(401).json({ error: 'Invalid current password' });
        }

        // Hash new password
        const newPasswordHash = await bcrypt.hash(newPassword, 10);

        // Update password
        await pgPool.query(
            'UPDATE auth.users SET password_hash = $1, password_changed_at = NOW() WHERE id = $2',
            [newPasswordHash, userId]
        );

        // Revoke all refresh tokens
        await pgPool.query(
            'UPDATE auth.refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
            [userId]
        );

        // Log password change
        await auditService.log('PASSWORD_CHANGED', userId, 'user', userId, {});

        res.json({ message: 'Password changed successfully' });
    } catch (error) {
        next(error);
    }
};

const forgotPassword = async (req, res, next) => {
    try {
        const { email } = req.body;

        // Find user
        const result = await pgPool.query(
            'SELECT id, first_name FROM auth.users WHERE email = $1 AND is_active = true',
            [email]
        );

        if (result.rows.length === 0) {
            // Don't reveal if email exists
            return res.json({ message: 'If the email exists, a reset link has been sent' });
        }

        const user = result.rows[0];
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');

        // Store reset token
        await pgPool.query(
            `UPDATE auth.users 
       SET password_reset_token = $1, 
           password_reset_expires = NOW() + INTERVAL '1 hour'
       WHERE id = $2`,
            [resetTokenHash, user.id]
        );

        // Send reset email
        await emailService.sendPasswordResetEmail(email, resetToken, user.first_name);

        // Log password reset request
        await auditService.log('PASSWORD_RESET_REQUESTED', user.id, 'user', user.id, { email });

        res.json({ message: 'If the email exists, a reset link has been sent' });
    } catch (error) {
        next(error);
    }
};

const resetPassword = async (req, res, next) => {
    try {
        const { token, newPassword } = req.body;

        const resetTokenHash = crypto.createHash('sha256').update(token).digest('hex');

        // Find user with valid reset token
        const result = await pgPool.query(
            `SELECT id FROM auth.users 
       WHERE password_reset_token = $1 
       AND password_reset_expires > NOW() 
       AND is_active = true`,
            [resetTokenHash]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({ error: 'Invalid or expired reset token' });
        }

        const userId = result.rows[0].id;

        // Hash new password
        const passwordHash = await bcrypt.hash(newPassword, 10);

        // Update password and clear reset token
        await pgPool.query(
            `UPDATE auth.users 
       SET password_hash = $1, 
           password_reset_token = NULL, 
           password_reset_expires = NULL,
           password_changed_at = NOW()
       WHERE id = $2`,
            [passwordHash, userId]
        );

        // Revoke all refresh tokens
        await pgPool.query(
            'UPDATE auth.refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
            [userId]
        );

        // Log password reset
        await auditService.log('PASSWORD_RESET_COMPLETED', userId, 'user', userId, {});

        res.json({ message: 'Password reset successfully' });
    } catch (error) {
        next(error);
    }
};

const verifyEmail = async (req, res, next) => {
    try {
        const { token } = req.params;

        // Find user with verification token
        const result = await pgPool.query(
            `UPDATE auth.users 
       SET email_verified = true, 
           verification_token = NULL 
       WHERE verification_token = $1 
       AND email_verified = false
       RETURNING id, email`,
            [token]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({ error: 'Invalid verification token' });
        }

        const user = result.rows[0];

        // Log email verification
        await auditService.log('EMAIL_VERIFIED', user.id, 'user', user.id, { email: user.email });

        res.json({ message: 'Email verified successfully' });
    } catch (error) {
        next(error);
    }
};

const resendVerification = async (req, res, next) => {
    try {
        const userId = req.user.id;

        // Check if already verified
        const userResult = await pgPool.query(
            'SELECT email, email_verified FROM auth.users WHERE id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (userResult.rows[0].email_verified) {
            return res.status(400).json({ error: 'Email already verified' });
        }

        const verificationToken = crypto.randomBytes(32).toString('hex');

        // Update verification token
        await pgPool.query(
            'UPDATE auth.users SET verification_token = $1 WHERE id = $2',
            [verificationToken, userId]
        );

        // Send verification email
        await emailService.sendVerificationEmail(userResult.rows[0].email, verificationToken);

        res.json({ message: 'Verification email sent' });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    login,
    register,
    refresh,
    logout,
    me,
    changePassword,
    forgotPassword,
    resetPassword,
    verifyEmail,
    resendVerification,
    serviceLogin,
};