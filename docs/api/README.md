## Authentication Endpoints

### Register
POST /api/auth/register
Body: {
email: string,
password: string (min 8 chars, must contain uppercase, lowercase, number),
firstName: string,
lastName: string
}
Response: {
accessToken: string,
refreshToken: string,
user: { id, email, firstName, lastName, role }
}

### Login
POST /api/auth/login
Body: {
email: string,
password: string
}
Response: {
accessToken: string,
refreshToken: string,
user: { id, email, firstName, lastName, role }
}

### Get Current User
GET /api/auth/me
Headers: { Authorization: "Bearer <accessToken>" }
Response: {
user: {
id: string,
email: string,
firstName: string,
lastName: string,
role: string,
emailVerified: boolean,
createdAt: string,
lastLoginAt: string
}
}

### Refresh Token
POST /api/auth/refresh
Body: { refreshToken: string }
Response: {
accessToken: string,
refreshToken: string
}

### Change Password
POST /api/auth/change-password
Headers: { Authorization: "Bearer <accessToken>" }
Body: {
currentPassword: string,
newPassword: string
}
Response: { message: "Password changed successfully" }

### Forgot Password
POST /api/auth/forgot-password
Body: { email: string }
Response: { message: "If the email exists, a reset link has been sent" }

### Reset Password
POST /api/auth/reset-password
Body: {
token: string,
newPassword: string
}
Response: { message: "Password reset successfully" }

### Verify Email
GET /api/auth/verify-email/:token
Response: { message: "Email verified successfully" }

### Resend Verification
POST /api/auth/resend-verification
Headers: { Authorization: "Bearer <accessToken>" }
Response: { message: "Verification email sent" }

### Logout
POST /api/auth/logout
Headers: { Authorization: "Bearer <accessToken>" }
Body: { refreshToken: string (optional) }
Response: { message: "Logged out successfully" }

## Security Features

- JWT-based authentication with access and refresh tokens
- Password hashing with bcrypt
- Email verification
- Password reset with secure tokens
- Rate limiting on sensitive endpoints
- Session management
- Audit logging for all auth actions
- CSRF protection
- XSS protection
- SQL injection prevention

## Token Management

- Access tokens expire in 7 days (configurable)
- Refresh tokens expire in 30 days
- Tokens are automatically refreshed on 401 responses
- All tokens are revoked on password change
- Session tracking for security monitoring