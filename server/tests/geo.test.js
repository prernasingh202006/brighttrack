const { startDb, stopDb, clearDb, agent, validComplaint, registeredAgent } = require('./helpers');
const geocode = require('../src/utils/geocode');

beforeAll(startDb);
afterAll(stopDb);
afterEach(() => {
  geocode.clearCache();
  return clearDb();
});

const realFetch = global.fetch;
afterAll(() => {
  global.fetch = realFetch;
});

const hit = (over = {}) => ({ lat: '19.0654', lon: '72.8353', display_name: 'Linking Road, Bandra West, Mumbai, India', address: { country_code: 'in' }, ...over });
let calls;
const upstream = (payload, ok = true, status = 200) => {
  calls = [];
  global.fetch = async (url) => {
    calls.push(new URL(String(url)));
    return { ok, status, json: async () => payload };
  };
};

describe('address search API', () => {
  test('requires login', async () => {
    upstream([hit()]);
    expect((await agent().get('/api/geo/search?q=linking road')).status).toBe(401);
    expect((await agent().get('/api/geo/reverse?lat=19&lng=72')).status).toBe(401);
    expect(calls).toHaveLength(0); // anonymous callers never reach the shared geocoder
  });

  test('searches, returns signed results and attribution', async () => {
    upstream([hit()]);
    const a = await registeredAgent();
    const res = await a.get('/api/geo/search').query({ q: 'linking road' });
    expect(res.status).toBe(200);
    expect(res.body.data.results).toHaveLength(1);
    expect(res.body.data.results[0]).toMatchObject({ label: 'Linking Road, Bandra West, Mumbai', lat: 19.0654, lng: 72.8353 });
    expect(res.body.data.results[0].token).toBeTruthy();
    expect(res.body.meta.attribution).toMatch(/OpenStreetMap/);
  });

  test('rejects too-short or too-long queries without calling the geocoder', async () => {
    upstream([hit()]);
    const a = await registeredAgent();
    expect((await a.get('/api/geo/search').query({ q: 'ab' })).status).toBe(400);
    expect((await a.get('/api/geo/search').query({ q: 'x'.repeat(101) })).status).toBe(400);
    expect((await a.get('/api/geo/search')).status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  test('an upstream outage is a 503 with a friendly message', async () => {
    upstream({}, false, 502);
    const a = await registeredAgent();
    const res = await a.get('/api/geo/search').query({ q: 'linking road' });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('GEO_UNAVAILABLE');
  });

  test('reverse geocoding (use my current location) returns a signed place at the given point', async () => {
    upstream(hit());
    const a = await registeredAgent();
    const res = await a.get('/api/geo/reverse').query({ lat: 19.0654321, lng: 72.8353219 });
    expect(res.status).toBe(200);
    expect(res.body.data.place).toMatchObject({ label: 'Linking Road, Bandra West, Mumbai', lat: 19.065432, lng: 72.835322 });
    expect(geocode.verifyLocation(res.body.data.place.token).location.lng).toBe(72.835322);
  });

  test.each([
    ['latitude out of range', { lat: 123, lng: 72 }],
    ['longitude out of range', { lat: 19, lng: 500 }],
    ['not numbers', { lat: 'abc', lng: 'def' }],
    ['missing', {}],
  ])('reverse rejects %s', async (_n, q) => {
    upstream(hit());
    const a = await registeredAgent();
    expect((await a.get('/api/geo/reverse').query(q)).status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  test('reverse: no address there is 404; a point outside the served country is 400', async () => {
    const a = await registeredAgent();
    upstream({ error: 'Unable to geocode' });
    const none = await a.get('/api/geo/reverse').query({ lat: 0.5, lng: 0.5 });
    expect(none.status).toBe(404);
    expect(none.body.error.code).toBe('NO_ADDRESS');
    upstream(hit({ address: { country_code: 'us' } }));
    const away = await a.get('/api/geo/reverse').query({ lat: 40.7, lng: -74 });
    expect(away.status).toBe(400);
    expect(away.body.error.code).toBe('OUT_OF_AREA');
  });

  test('end to end: a searched place can be reported, and its address and coordinates are what get stored', async () => {
    upstream([hit({ display_name: 'Marine Drive, Churchgate, Mumbai, India', lat: '18.944', lon: '72.823' })]);
    const a = await registeredAgent();
    const found = (await a.get('/api/geo/search').query({ q: 'marine drive' })).body.data.results[0];
    const res = await a.post('/api/complaints').send({ ...validComplaint(), locationToken: found.token });
    expect(res.status).toBe(201);
    expect(res.body.data.complaint.location).toBe('Marine Drive, Churchgate, Mumbai');
    expect(res.body.data.complaint.coords).toEqual({ lat: 18.944, lng: 72.823 });
  });
});
