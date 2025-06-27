const { logger } = require('../config/database');

class EmailService {
    constructor() {
        // In production, initialize email provider (SendGrid, AWS SES, etc.)
        this.fromEmail = process.env.EMAIL_FROM || 'noreply@gridmonitor.com';
        this.frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    }

    async sendEmail(to, subject, html, text) {
        // Mock implementation - log email
        logger.info('Email sent', {
            to,
            subject,
            preview: text?.substring(0, 100),
        });

        // In production:
        // await emailProvider.send({ to, from: this.fromEmail, subject, html, text });

        return true;
    }

    async sendVerificationEmail(email, token) {
        const verificationUrl = `${this.frontendUrl}/auth/verify-email?token=${token}`;

        const subject = 'Verify your email - Grid Monitor';
        const html = `
      <h2>Welcome to Grid Monitor!</h2>
      <p>Please verify your email address by clicking the link below:</p>
      <a href="${verificationUrl}" style="display: inline-block; padding: 12px 24px; background-color: #3182ce; color: white; text-decoration: none; border-radius: 4px;">Verify Email</a>
      <p>Or copy and paste this link:</p>
      <p>${verificationUrl}</p>
      <p>This link will expire in 24 hours.</p>
    `;
        const text = `
      Welcome to Grid Monitor!
      
      Please verify your email address by visiting:
      ${verificationUrl}
      
      This link will expire in 24 hours.
    `;

        return this.sendEmail(email, subject, html, text);
    }

    async sendPasswordResetEmail(email, token, firstName) {
        const resetUrl = `${this.frontendUrl}/auth/reset-password?token=${token}`;

        const subject = 'Reset your password - Grid Monitor';
        const html = `
      <h2>Hello ${firstName || 'there'},</h2>
      <p>We received a request to reset your password. Click the link below to create a new password:</p>
      <a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background-color: #3182ce; color: white; text-decoration: none; border-radius: 4px;">Reset Password</a>
      <p>Or copy and paste this link:</p>
      <p>${resetUrl}</p>
      <p>This link will expire in 1 hour. If you didn't request this, please ignore this email.</p>
    `;
        const text = `
      Hello ${firstName || 'there'},
      
      We received a request to reset your password. Visit the link below:
      ${resetUrl}
      
      This link will expire in 1 hour. If you didn't request this, please ignore this email.
    `;

        return this.sendEmail(email, subject, html, text);
    }

    async sendAlarmNotification(email, alarm) {
        const subject = `[${alarm.severity.toUpperCase()}] Grid Monitor Alert - ${alarm.alarm_type}`;
        const html = `
      <h2>Grid Monitor Alert</h2>
      <p><strong>Severity:</strong> ${alarm.severity}</p>
      <p><strong>Type:</strong> ${alarm.alarm_type}</p>
      <p><strong>Element:</strong> ${alarm.element_id}</p>
      <p><strong>Message:</strong> ${alarm.message}</p>
      <p><strong>Time:</strong> ${new Date(alarm.created_at).toLocaleString()}</p>
      <p>Login to Grid Monitor to view more details and acknowledge this alarm.</p>
    `;
        const text = `
      Grid Monitor Alert
      
      Severity: ${alarm.severity}
      Type: ${alarm.alarm_type}
      Element: ${alarm.element_id}
      Message: ${alarm.message}
      Time: ${new Date(alarm.created_at).toLocaleString()}
      
      Login to Grid Monitor to view more details.
    `;

        return this.sendEmail(email, subject, html, text);
    }
}

module.exports = new EmailService();