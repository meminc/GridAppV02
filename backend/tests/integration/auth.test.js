const request = require('supertest');
const app = require('../../src/index');
const { pgPool, neo4jDriver, redisClient } = require('../../src/config/database');

describe('Authentication API Tests', () => {
    let testUser = {
        email: 'test@example.com',
        password: 'TestPass123!',
        firstName: 'Test',
        lastName: 'User',
    };

    let authTokens = {};

    beforeAll(async () => {
        // Clean up test user if exists
        await pgPool.query('DELETE FROM auth.users WHERE email = $1', [testUser.email]);
    });

    afterAll(async () => {
        // Cleanup
        await pgPool.query('DELETE FROM auth.users WHERE email = $1', [testUser.email]);
        await pgPool.end();
        await neo4jDriver.close();
        await redisClient.quit();
    });

    describe('POST /api/auth/register', () => {
        it('should register a new user', async () => {
            const response = await request(app)
                .post('/api/auth/register')
                .send(testUser);

            expect(response.status).toBe(201);
            expect(response.body).toHaveProperty('accessToken');
            expect(response.body).toHaveProperty('refreshToken');
            expect(response.body.user.email).toBe(testUser.email);

            authTokens = {
                accessToken: response.body.accessToken,
                refreshToken: response.body.refreshToken,
            };
        });

        it('should not register duplicate email', async () => {
            const response = await request(app)
                .post('/api/auth/register')
                .send(testUser);

            expect(response.status).toBe(400);
            expect(response.body.error).toBe('User already exists');
        });

        it('should validate password requirements', async () => {
            const response = await request(app)
                .post('/api/auth/register')
                .send({
                    ...testUser,
                    email: 'weak@example.com',
                    password: 'weak',
                });

            expect(response.status).toBe(400);
            expect(response.body.errors).toBeDefined();
        });
    });

    describe('POST /api/auth/login', () => {
        it('should login with valid credentials', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    email: testUser.email,
                    password: testUser.password,
                });

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('accessToken');
            expect(response.body).toHaveProperty('refreshToken');
        });

        it('should reject invalid password', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    email: testUser.email,
                    password: 'wrongpassword',
                });

            expect(response.status).toBe(401);
            expect(response.body.error).toBe('Invalid credentials');
        });

        it('should reject non-existent user', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'nonexistent@example.com',
                    password: 'password',
                });

            expect(response.status).toBe(401);
            expect(response.body.error).toBe('Invalid credentials');
        });
    });

    describe('GET /api/auth/me', () => {
        it('should return current user info', async () => {
            const response = await request(app)
                .get('/api/auth/me')
                .set('Authorization', `Bearer ${authTokens.accessToken}`);

            expect(response.status).toBe(200);
            expect(response.body.user.email).toBe(testUser.email);
            expect(response.body.user.firstName).toBe(testUser.firstName);
        });

        it('should reject without token', async () => {
            const response = await request(app)
                .get('/api/auth/me');

            expect(response.status).toBe(401);
        });

        it('should reject with invalid token', async () => {
            const response = await request(app)
                .get('/api/auth/me')
                .set('Authorization', 'Bearer invalid-token');

            expect(response.status).toBe(401);
        });
    });

    describe('POST /api/auth/refresh', () => {
        it('should refresh access token', async () => {
            const response = await request(app)
                .post('/api/auth/refresh')
                .send({
                    refreshToken: authTokens.refreshToken,
                });

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('accessToken');
            expect(response.body).toHaveProperty('refreshToken');

            // Update tokens
            authTokens.accessToken = response.body.accessToken;
            authTokens.refreshToken = response.body.refreshToken;
        });

        it('should reject invalid refresh token', async () => {
            const response = await request(app)
                .post('/api/auth/refresh')
                .send({
                    refreshToken: 'invalid-refresh-token',
                });

            expect(response.status).toBe(401);
        });
    });

    describe('POST /api/auth/change-password', () => {
        it('should change password with valid current password', async () => {
            const response = await request(app)
                .post('/api/auth/change-password')
                .set('Authorization', `Bearer ${authTokens.accessToken}`)
                .send({
                    currentPassword: testUser.password,
                    newPassword: 'NewTestPass123!',
                });

            expect(response.status).toBe(200);
            expect(response.body.message).toBe('Password changed successfully');

            // Update test password
            testUser.password = 'NewTestPass123!';
        });

        it('should reject with wrong current password', async () => {
            const response = await request(app)
                .post('/api/auth/change-password')
                .set('Authorization', `Bearer ${authTokens.accessToken}`)
                .send({
                    currentPassword: 'wrongpassword',
                    newPassword: 'NewTestPass123!',
                });

            expect(response.status).toBe(401);
            expect(response.body.error).toBe('Invalid current password');
        });
    });

    describe('POST /api/auth/forgot-password', () => {
        it('should accept forgot password request', async () => {
            const response = await request(app)
                .post('/api/auth/forgot-password')
                .send({
                    email: testUser.email,
                });

            expect(response.status).toBe(200);
            expect(response.body.message).toBe('If the email exists, a reset link has been sent');
        });

        it('should return same message for non-existent email', async () => {
            const response = await request(app)
                .post('/api/auth/forgot-password')
                .send({
                    email: 'nonexistent@example.com',
                });

            expect(response.status).toBe(200);
            expect(response.body.message).toBe('If the email exists, a reset link has been sent');
        });
    });

    describe('POST /api/auth/logout', () => {
        it('should logout successfully', async () => {
            const response = await request(app)
                .post('/api/auth/logout')
                .set('Authorization', `Bearer ${authTokens.accessToken}`)
                .send({
                    refreshToken: authTokens.refreshToken,
                });

            expect(response.status).toBe(200);
            expect(response.body.message).toBe('Logged out successfully');
        });

        it('should invalidate refresh token after logout', async () => {
            const response = await request(app)
                .post('/api/auth/refresh')
                .send({
                    refreshToken: authTokens.refreshToken,
                });

            expect(response.status).toBe(401);
        });
    });
});