const { startDb, stopDb, clearDb, agent, validUser, lastCodeFor, registeredAgent } = require('./helpers');
const User = require('../src/models/User');
const env = require('../src/config/env');
const mailer = require('../src/utils/mailer');

beforeAll(startDb);
afterAll(stopDb);
afterEach(clearDb);

const register = (over) => agent().post('/api/auth/register').send(validUser(over));
const wrongCode = (code) => (code === '000000' ? '000001' : '000000');
const EMAIL = 'asha@gmail.com';
const sentTo = (email) => mailer.outbox.filter((m) => m.to === email);

describe('sign-up with email verification', () => {
  test('register sends a code and creates an UNVERIFIED account with no session', async () => {
    const a = agent();
    const res = await a.post('/api/auth/register').send(validUser());
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ needsVerification: true, email: EMAIL, expiresInMinutes: 10, resendAfterSeconds: 60 });
    expect(res.body.data.user).toBeUndefined();
    expect(res.headers['set-cookie']).toBeUndefined(); // no session until the code is entered
    expect((await a.get('/api/auth/me')).status).toBe(401);

    const mails = sentTo(EMAIL);
    expect(mails).toHaveLength(1);
    expect(mails[0].meta.code).toMatch(/^\d{6}$/);
    expect(mails[0].text).toContain(mails[0].meta.code);

    const stored = await User.findOne({ email: EMAIL }).select('+passwordHash +verifyCodeHash');
    expect(stored.emailVerified).toBe(false);
    expect(stored.role).toBe('resident');
    expect(stored.unverifiedExpiresAt).toBeTruthy(); // auto-deleted if never verified
    expect(stored.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(stored.verifyCodeHash).not.toContain(mails[0].meta.code); // only a hash of the code is stored
    expect(JSON.stringify(res.body)).not.toContain(mails[0].meta.code); // and the code never appears in the API response
  });

  test('the correct code verifies the account, logs the user in with an httpOnly cookie and cannot be reused', async () => {
    await register();
    const code = lastCodeFor(EMAIL);
    const a = agent();
    const res = await a.post('/api/auth/verify-email').send({ email: EMAIL, code });
    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({ email: EMAIL, role: 'resident' });
    expect(res.body.data.user.passwordHash).toBeUndefined();
    expect(res.body.data.user.verifyCodeHash).toBeUndefined();
    expect(res.headers['set-cookie'][0]).toMatch(/HttpOnly/i);
    expect((await a.get('/api/auth/me')).status).toBe(200);

    const stored = await User.findOne({ email: EMAIL }).select('+verifyCodeHash');
    expect(stored.emailVerified).toBe(true);
    expect(stored.verifyCodeHash).toBeUndefined();
    expect(stored.unverifiedExpiresAt).toBeUndefined(); // no longer auto-deleted

    const again = await agent().post('/api/auth/verify-email').send({ email: EMAIL, code });
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe('ALREADY_VERIFIED');
  });

  test('login is refused until the email is verified, then works', async () => {
    await register();
    const blocked = await agent().post('/api/auth/login').send({ email: EMAIL, password: 'Password123' });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('EMAIL_NOT_VERIFIED');
    expect(blocked.headers['set-cookie']).toBeUndefined();

    await agent().post('/api/auth/verify-email').send({ email: EMAIL, code: lastCodeFor(EMAIL) });
    const ok = await agent().post('/api/auth/login').send({ email: EMAIL, password: 'Password123' });
    expect(ok.status).toBe(200);
  });

  test('a wrong password still looks like any other bad login (no verification hint without the password)', async () => {
    await register();
    const res = await agent().post('/api/auth/login').send({ email: EMAIL, password: 'WrongPassword1' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('BAD_CREDENTIALS');
  });

  test('wrong codes are counted; after 5 the code is locked even if the right one is then entered', async () => {
    await register();
    const code = lastCodeFor(EMAIL);
    const a = agent();
    for (let tries = 1; tries <= 4; tries += 1) {
      // eslint-disable-next-line no-await-in-loop
      const res = await a.post('/api/auth/verify-email').send({ email: EMAIL, code: wrongCode(code) });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('CODE_INVALID');
      expect(res.body.error.message).toMatch(new RegExp(`${5 - tries} attempts? left`));
    }
    const fifth = await a.post('/api/auth/verify-email').send({ email: EMAIL, code: wrongCode(code) });
    expect(fifth.status).toBe(429);
    expect(fifth.body.error.code).toBe('TOO_MANY_ATTEMPTS');

    const rightButLocked = await a.post('/api/auth/verify-email').send({ email: EMAIL, code });
    expect(rightButLocked.status).toBe(429);
    expect((await User.findOne({ email: EMAIL })).emailVerified).toBe(false);

    // a fresh code (after the resend cooldown) unlocks it
    await User.updateOne({ email: EMAIL }, { verifySentAt: new Date(0) });
    expect((await agent().post('/api/auth/resend-code').send({ email: EMAIL })).status).toBe(200);
    const fresh = lastCodeFor(EMAIL);
    expect((await agent().post('/api/auth/verify-email').send({ email: EMAIL, code: fresh })).status).toBe(200);
  });

  test('an expired code is refused', async () => {
    await register();
    await User.updateOne({ email: EMAIL }, { verifyExpiresAt: new Date(Date.now() - 1000) });
    const res = await agent().post('/api/auth/verify-email').send({ email: EMAIL, code: lastCodeFor(EMAIL) });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('CODE_EXPIRED');
  });

  test('malformed codes and unknown emails are rejected without leaking anything', async () => {
    await register();
    for (const code of ['12345', '1234567', 'abcdef', '12 456', '']) {
      // eslint-disable-next-line no-await-in-loop
      expect((await agent().post('/api/auth/verify-email').send({ email: EMAIL, code })).status).toBe(400);
    }
    const ghost = await agent().post('/api/auth/verify-email').send({ email: 'nobody@gmail.com', code: '123456' });
    expect(ghost.status).toBe(400);
    expect(ghost.body.error.code).toBe('CODE_INVALID');
    expect((await agent().post('/api/auth/verify-email').send({ email: { $ne: null }, code: '123456' })).status).toBe(400);
  });

  test('resend: cooldown applies, then a new code replaces the old one', async () => {
    await register();
    const first = lastCodeFor(EMAIL);

    const tooSoon = await agent().post('/api/auth/resend-code').send({ email: EMAIL });
    expect(tooSoon.status).toBe(429);
    expect(tooSoon.body.error.code).toBe('RESEND_COOLDOWN');
    expect(sentTo(EMAIL)).toHaveLength(1);

    await User.updateOne({ email: EMAIL }, { verifySentAt: new Date(Date.now() - 61000) });
    const ok = await agent().post('/api/auth/resend-code').send({ email: EMAIL });
    expect(ok.status).toBe(200);
    expect(sentTo(EMAIL)).toHaveLength(2);
    const second = lastCodeFor(EMAIL);

    if (second !== first) {
      const old = await agent().post('/api/auth/verify-email').send({ email: EMAIL, code: first });
      expect(old.status).toBe(400); // the earlier code no longer works
    }
    expect((await agent().post('/api/auth/verify-email').send({ email: EMAIL, code: second })).status).toBe(200);
  });

  test('resend answers identically for unknown and already-verified emails and sends nothing', async () => {
    await registeredAgent();
    mailer.outbox.length = 0;
    const unknown = await agent().post('/api/auth/resend-code').send({ email: 'nobody@gmail.com' });
    const verified = await agent().post('/api/auth/resend-code').send({ email: EMAIL });
    expect(unknown.status).toBe(200);
    expect(verified.status).toBe(200);
    expect(unknown.body).toEqual(verified.body);
    expect(mailer.outbox).toHaveLength(0);
  });

  test('signing up again with an unverified address takes it over (after the cooldown) and the old code dies', async () => {
    await register();
    const firstCode = lastCodeFor(EMAIL);
    const tooSoon = await register({ name: 'Someone Else', password: 'OtherPass123', confirmPassword: 'OtherPass123' });
    expect(tooSoon.status).toBe(429);

    await User.updateOne({ email: EMAIL }, { verifySentAt: new Date(0) });
    const again = await register({ name: 'Real Owner', password: 'OtherPass123', confirmPassword: 'OtherPass123' });
    expect(again.status).toBe(201);
    expect(await User.countDocuments({ email: EMAIL })).toBe(1);
    const newCode = lastCodeFor(EMAIL);
    if (newCode !== firstCode) expect((await agent().post('/api/auth/verify-email').send({ email: EMAIL, code: firstCode })).status).toBe(400);
    const done = await agent().post('/api/auth/verify-email').send({ email: EMAIL, code: newCode });
    expect(done.status).toBe(200);
    expect(done.body.data.user.name).toBe('Real Owner');
    expect((await agent().post('/api/auth/login').send({ email: EMAIL, password: 'OtherPass123' })).status).toBe(200);
  });

  test('a verified email cannot be registered again (409)', async () => {
    await registeredAgent();
    const res = await register();
    expect(res.status).toBe(409);
  });

  test('public registration can never create an admin', async () => {
    const a = await registeredAgent({ role: 'admin' });
    expect((await a.get('/api/auth/me')).body.data.user.role).toBe('resident');
  });

  test.each([
    ['short password', { password: 'short', confirmPassword: 'short' }],
    ['mismatched confirm', { confirmPassword: 'Different123' }],
    ['bad phone', { phone: '12345' }],
    ['bad email', { email: 'nope' }],
  ])('register rejects %s with 400 and sends no email', async (_n, over) => {
    const res = await register(over);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(mailer.outbox).toHaveLength(0);
    expect(await User.countDocuments()).toBe(0);
  });

  test.each([
    ['a disposable-mailbox service', 'someone@mailinator.com', /disposable/i],
    ['a subdomain of a disposable service', 'someone@x.yopmail.com', /disposable/i],
    ['a placeholder domain (example.com)', 'someone@example.com', /real email/i],
    ['a reserved TLD (.test)', 'someone@company.test', /real email/i],
    ['a reserved TLD (.local)', 'someone@brighttrack.local', /real email/i],
  ])('register rejects %s, names the email field and sends nothing', async (_n, email, message) => {
    const res = await register({ email });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toEqual([expect.objectContaining({ field: 'email', message: expect.stringMatching(message) })]);
    expect(mailer.outbox).toHaveLength(0);
    expect(await User.countDocuments()).toBe(0);
  });
});

describe('email sending', () => {
  const original = { ...env.mail };
  afterEach(() => {
    Object.assign(env.mail, original);
  });

  test('when no email service is configured, sign-up is refused with a clear 503 (no silent fake sign-ups)', async () => {
    env.mail.provider = 'none';
    const res = await register();
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('EMAIL_NOT_CONFIGURED');
    expect(await User.countDocuments()).toBe(0);
    expect((await agent().post('/api/auth/resend-code').send({ email: EMAIL })).status).toBe(503);
  });

  test('the Brevo provider calls the HTTPS API with the key, sender, recipient and the code', async () => {
    Object.assign(env.mail, { provider: 'brevo', brevoKey: 'test-key', fromEmail: 'noreply@brighttrack.app', fromName: 'BrightTrack' });
    const realFetch = global.fetch;
    const fetchMock = jest.fn(async () => ({ ok: true, status: 201, text: async () => '' }));
    global.fetch = fetchMock;
    try {
      const res = await register();
      expect(res.status).toBe(201);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, opts] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.brevo.com/v3/smtp/email');
      expect(opts.method).toBe('POST');
      expect(opts.headers['api-key']).toBe('test-key');
      const body = JSON.parse(opts.body);
      expect(body.sender).toEqual({ name: 'BrightTrack', email: 'noreply@brighttrack.app' });
      expect(body.to).toEqual([{ email: EMAIL }]);
      expect(body.textContent).toMatch(/\b\d{6}\b/);
      expect(JSON.stringify(res.body)).not.toMatch(/\b\d{6}\b/);
    } finally {
      global.fetch = realFetch;
    }
  });

  test('if the email provider fails, the user gets a 502 and may retry immediately (no cooldown penalty)', async () => {
    Object.assign(env.mail, { provider: 'brevo', brevoKey: 'test-key', fromEmail: 'noreply@brighttrack.app' });
    const realFetch = global.fetch;
    global.fetch = jest.fn(async () => ({ ok: false, status: 401, text: async () => '{"message":"Key not found"}' }));
    try {
      const res = await register();
      expect(res.status).toBe(502);
      expect(res.body.error.code).toBe('EMAIL_SEND_FAILED');
      expect(JSON.stringify(res.body)).not.toMatch(/Key not found|test-key/); // provider details are never leaked
      global.fetch = jest.fn(async () => ({ ok: true, status: 201, text: async () => '' }));
      expect((await register()).status).toBe(201);
    } finally {
      global.fetch = realFetch;
    }
  });
});

describe('login and sessions', () => {
  test('login succeeds, then /me returns the user; wrong password gives 401', async () => {
    await registeredAgent();
    const a = agent();
    const bad = await a.post('/api/auth/login').send({ email: EMAIL, password: 'wrongpass1' });
    expect(bad.status).toBe(401);
    expect(bad.body.error.message).toBe('Invalid email or password');

    const ok = await a.post('/api/auth/login').send({ email: EMAIL, password: 'Password123' });
    expect(ok.status).toBe(200);
    const me = await a.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.data.user.email).toBe(EMAIL);
  });

  test('accounts that existed before verification was added (no flag) can still log in', async () => {
    await User.create({ name: 'Old User', email: 'old@gmail.com', passwordHash: await User.hashPassword('Password123') });
    const res = await agent().post('/api/auth/login').send({ email: 'old@gmail.com', password: 'Password123' });
    expect(res.status).toBe(200);
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
