const request = require('supertest');
const app = require('../../src/index');
const { pgPool, neo4jDriver } = require('../../src/config/database');

describe('Element API Integration Tests', () => {
    let authToken;
    let testElementId;

    beforeAll(async () => {
        // Login as engineer
        const loginResponse = await request(app)
            .post('/api/auth/login')
            .send({
                email: 'engineer@gridmonitor.com',
                password: 'engineer123',
            });

        authToken = loginResponse.body.token;
    });

    afterAll(async () => {
        await pgPool.end();
        await neo4jDriver.close();
    });

    describe('GET /api/elements', () => {
        it('should return all elements', async () => {
            const response = await request(app)
                .get('/api/elements')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('elements');
            expect(Array.isArray(response.body.elements)).toBe(true);
        });

        it('should require authentication', async () => {
            const response = await request(app)
                .get('/api/elements');

            expect(response.status).toBe(401);
        });
    });

    describe('POST /api/elements', () => {
        it('should create a new element', async () => {
            const newElement = {
                type: 'Bus',
                name: 'Test Bus',
                properties: {
                    voltage_level: 110,
                    location: 'Test Location',
                },
            };

            const response = await request(app)
                .post('/api/elements')
                .set('Authorization', `Bearer ${authToken}`)
                .send(newElement);

            expect(response.status).toBe(201);
            expect(response.body.element).toHaveProperty('id');
            expect(response.body.element.name).toBe('Test Bus');

            testElementId = response.body.element.id;
        });

        it('should validate element type', async () => {
            const invalidElement = {
                type: 'InvalidType',
                name: 'Test',
            };

            const response = await request(app)
                .post('/api/elements')
                .set('Authorization', `Bearer ${authToken}`)
                .send(invalidElement);

            expect(response.status).toBe(400);
        });
    });

    describe('PUT /api/elements/:id', () => {
        it('should update an element', async () => {
            const updates = {
                name: 'Updated Test Bus',
                voltage_level: 220,
            };

            const response = await request(app)
                .put(`/api/elements/${testElementId}`)
                .set('Authorization', `Bearer ${authToken}`)
                .send(updates);

            expect(response.status).toBe(200);
            expect(response.body.element.name).toBe('Updated Test Bus');
        });
    });

    describe('DELETE /api/elements/:id', () => {
        it('should require admin role', async () => {
            const response = await request(app)
                .delete(`/api/elements/${testElementId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(403);
        });
    });
});