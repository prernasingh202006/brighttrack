const request = require('supertest');
const { app, startDb, stopDb, clearDb, agent, validUser, registeredAgent } = require('./helpers');

beforeAll(startDb);
afterAll(stopDb);
afterEach(clearDb);

describe('security', () => {
  test('NoSQL injection in login is rejected', async () => {
    await registeredAgent();
    const res = await agent().post('/api/auth/login').send({ email: { $ne: null }, password: { $ne: null } });
    expect(res.status).toBe(400);
  });

  test('state-changing requests without the X-Requested-With header are refused (CSRF)', async () => {
    const res = await request(app).post('/api/auth/register').send(validUser());
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF');
  });

  test('oversized bodies are refused with 413', async () => {
    const res = await agent().post('/api/auth/login').send({ email: 'a@b.co', password: 'x'.repeat(20000) });
    expect(res.status).toBe(413);
  });

  test('malformed JSON gives a consistent 400 error', async () => {
    const res = await agent().post('/api/auth/login').set('Content-Type', 'application/json').send('{bad json');
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ success: false, error: { code: 'BAD_JSON' } });
  });

  test('CORS only allows the frontend origin; Helmet headers are present', async () => {
    const ok = await request(app).get('/api/health').set('Origin', 'http://localhost:5173');
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(ok.headers['access-control-allow-credentials']).toBe('true');
    expect(ok.headers['x-content-type-options']).toBe('nosniff');

    const bad = await request(app).get('/api/health').set('Origin', 'https://evil.example');
    expect(bad.headers['access-control-allow-origin']).toBeUndefined();
  });

  test('unknown routes return the JSON error shape', async () => {
    const res = await agent().get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
