const { startDb, stopDb, clearDb, agent, validUser, registeredAgent } = require('./helpers');
const User = require('../src/models/User');

beforeAll(startDb);
afterAll(stopDb);
afterEach(clearDb);

describe('auth', () => {
  test('register creates a resident, hashes the password and sets an httpOnly cookie', async () => {
    const res = await agent().post('/api/auth/register').send(validUser());
    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe('resident');
    expect(res.body.data.user.passwordHash).toBeUndefined();
    expect(res.headers['set-cookie'][0]).toMatch(/HttpOnly/i);

    const stored = await User.findOne({ email: 'asha@example.com' }).select('+passwordHash');
    expect(stored.passwordHash).not.toBe('Password123');
    expect(stored.passwordHash).toMatch(/^\$2[aby]\$/);
  });

  test('public registration can never create an admin', async () => {
    const res = await agent().post('/api/auth/register').send({ ...validUser(), role: 'admin' });
    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe('resident');
  });

  test.each([
    ['short password', { password: 'short', confirmPassword: 'short' }],
    ['mismatched confirm', { confirmPassword: 'Different123' }],
    ['bad phone', { phone: '12345' }],
    ['bad email', { email: 'nope' }],
  ])('register rejects %s with 400', async (_n, over) => {
    const res = await agent().post('/api/auth/register').send(validUser(over));
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('duplicate email returns 409', async () => {
    await registeredAgent();
    const res = await agent().post('/api/auth/register').send(validUser());
    expect(res.status).toBe(409);
  });

  test('login succeeds, then /me returns the user; wrong password gives 401', async () => {
    await registeredAgent();
    const a = agent();
    const bad = await a.post('/api/auth/login').send({ email: 'asha@example.com', password: 'wrongpass1' });
    expect(bad.status).toBe(401);
    expect(bad.body.error.message).toBe('Invalid email or password');

    const ok = await a.post('/api/auth/login').send({ email: 'asha@example.com', password: 'Password123' });
    expect(ok.status).toBe(200);
    const me = await a.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.data.user.email).toBe('asha@example.com');
  });

  test('logout clears the session', async () => {
    const a = await registeredAgent();
    expect((await a.get('/api/auth/me')).status).toBe(200);
    expect((await a.post('/api/auth/logout')).status).toBe(200);
    expect((await a.get('/api/auth/me')).status).toBe(401);
  });

  test('/me without a cookie is 401', async () => {
    const res = await agent().get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});
