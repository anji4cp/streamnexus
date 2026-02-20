const request = require('supertest');
const app = require('../app');
const { initializeDatabase } = require('../db/database');

describe('Smoke Tests', () => {
    beforeAll(async () => {
        await initializeDatabase();
    });

    test('GET / should return 302 (redirect to login or setup)', async () => {
        const res = await request(app).get('/');
        expect(res.statusCode).toBe(302);
    });

    test('GET /login should handle request', async () => {
        const res = await request(app).get('/login');
        // Depending on state (setup or not, logged in or not), it might be 200 or 302
        expect([200, 302]).toContain(res.statusCode);
    });
});
