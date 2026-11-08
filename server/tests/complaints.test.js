const { startDb, stopDb, clearDb, agent, validComplaint, place, registeredAgent } = require('./helpers');
const { signLocation } = require('../src/utils/geocode');

beforeAll(startDb);
afterAll(stopDb);
afterEach(clearDb);

describe('complaint creation', () => {
  test('requires login', async () => {
    const res = await agent().post('/api/complaints').send(validComplaint());
    expect(res.status).toBe(401);
  });

  test('creates a complaint with a BT-XXXXX id and an initial history entry', async () => {
    const a = await registeredAgent();
    const res = await a.post('/api/complaints').send(validComplaint());
    expect(res.status).toBe(201);
    const c = res.body.data.complaint;
    expect(c.complaintId).toMatch(/^BT-[A-Z0-9]{5}$/);
    expect(c.status).toBe('Pending');
    expect(c.history).toHaveLength(1);
    expect(c.history[0].changedBy).toBeUndefined(); // residents never see who changed it
  });

  test.each([
    ['missing location', { locationToken: '' }],
    ['typed-in location instead of a verified one', { locationToken: 'Some street I made up' }],
    ['a location token with a forged signature', { locationToken: `${signLocation(place('Real Place')).split('.')[0]}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA` }],
    ['short description', { description: 'too short' }],
    ['long description', { description: 'x'.repeat(401) }],
    ['bad type', { type: 'Broken glass' }],
  ])('rejects %s with 400', async (_n, over) => {
    const a = await registeredAgent();
    const res = await a.post('/api/complaints').send(validComplaint(over));
    expect(res.status).toBe(400);
  });

  test('the location is taken from the signed token: typed text is ignored and coordinates are stored', async () => {
    const a = await registeredAgent();
    const res = await a
      .post('/api/complaints')
      .send({ ...validComplaint({ place: place('Linking Road, Bandra West, Mumbai', 19.0654, 72.8353) }), location: 'Totally Fake Place', coords: { lat: 1, lng: 1 } });
    expect(res.status).toBe(201);
    const c = res.body.data.complaint;
    expect(c.location).toBe('Linking Road, Bandra West, Mumbai');
    expect(c.coords).toEqual({ lat: 19.0654, lng: 72.8353 });
    expect(c.images).toEqual([]);
    // the public tracking page shows the place name but never the exact coordinates
    const pub = await agent().get(`/api/complaints/track/${c.complaintId}`);
    expect(pub.body.data.complaint.location).toBe('Linking Road, Bandra West, Mumbai');
    expect(JSON.stringify(pub.body)).not.toMatch(/19\.0654|72\.8353|coords|images/);
  });

  test('an expired location token is refused with a message that names the location field', async () => {
    const a = await registeredAgent();
    const res = await a.post('/api/complaints').send(validComplaint({ locationToken: signLocation(place(), -1000) }));
    expect(res.status).toBe(400);
    expect(res.body.error.details[0]).toMatchObject({ field: 'locationToken' });
    expect(res.body.error.message).toMatch(/expired/i);
  });

  test('client cannot set status, user or complaintId', async () => {
    const a = await registeredAgent();
    const res = await a
      .post('/api/complaints')
      .send({ ...validComplaint(), status: 'Resolved', complaintId: 'BT-HACKD', user: '000000000000000000000000' });
    expect(res.status).toBe(201);
    expect(res.body.data.complaint.status).toBe('Pending');
    expect(res.body.data.complaint.complaintId).not.toBe('BT-HACKD');
  });

  test('strips HTML from text fields (XSS)', async () => {
    const a = await registeredAgent();
    const res = await a.post('/api/complaints').send(validComplaint({ place: place('Main St <script>alert(1)</script>') }));
    expect(res.status).toBe(201);
    expect(res.body.data.complaint.location).not.toMatch(/<|script/i);
    const bad = await a.post('/api/complaints').send(validComplaint({ pole: '<img src=x onerror=alert(1)>' }));
    expect(bad.body.data.complaint.pole || '').not.toMatch(/<|onerror/i);
  });
});

describe('public endpoints', () => {
  test('track by id exposes no personal data; unknown id is 404; bad format is 400', async () => {
    const a = await registeredAgent();
    const { body } = await a.post('/api/complaints').send(validComplaint());
    const id = body.data.complaint.complaintId;

    const res = await agent().get(`/api/complaints/track/${id.toLowerCase()}`);
    expect(res.status).toBe(200);
    expect(res.body.data.complaint.status).toBe('Pending');
    expect(JSON.stringify(res.body)).not.toMatch(/asha|example\.com|9876543210|user|description/i);

    expect((await agent().get('/api/complaints/track/BT-ZZZZZ')).status).toBe(404);
    expect((await agent().get('/api/complaints/track/nonsense')).status).toBe(400);
  });

  test('recent list and stats are public and anonymous', async () => {
    const a = await registeredAgent();
    await a.post('/api/complaints').send(validComplaint());
    const recent = await agent().get('/api/complaints/recent');
    expect(recent.status).toBe(200);
    expect(Object.keys(recent.body.data.complaints[0]).sort()).toEqual(['createdAt', 'location', 'status', 'type']);

    const stats = await agent().get('/api/complaints/stats');
    expect(stats.body.data).toEqual({ total: 1, pending: 1, inProgress: 0, resolved: 0, unsafeOpen: 1 });
  });

  test('health endpoint reports ok', async () => {
    const res = await agent().get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.data.db).toBe('up');
  });
});

describe('ownership', () => {
  test('a resident only lists their own complaints and cannot read another user\'s', async () => {
    const alice = await registeredAgent();
    const bob = await registeredAgent({ email: 'bob@gmail.com', name: 'Bob Kumar' });
    const { body } = await alice.post('/api/complaints').send(validComplaint());
    const id = body.data.complaint.complaintId;

    expect((await bob.get('/api/complaints/mine')).body.data.complaints).toHaveLength(0);
    expect((await alice.get('/api/complaints/mine')).body.data.complaints).toHaveLength(1);
    expect((await alice.get(`/api/complaints/mine/${id}`)).status).toBe(200);
    expect((await bob.get(`/api/complaints/mine/${id}`)).status).toBe(404);
  });
});
