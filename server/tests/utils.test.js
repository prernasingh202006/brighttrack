// Pure-logic tests: no database and no network (fetch is replaced by a recorder).
const geocode = require('../src/utils/geocode');
const { detectImageType } = require('../src/utils/imageType');
const { generateCode, hashCode } = require('../src/utils/verification');

const place = { label: 'Linking Road, Bandra West, Mumbai', lat: 19.0654, lng: 72.8353 };

describe('signed location tokens', () => {
  test('round-trip returns exactly the signed place', () => {
    const out = geocode.verifyLocation(geocode.signLocation(place));
    expect(out).toEqual({ location: place });
  });

  test('changing the payload (e.g. moving the pin) invalidates the signature', () => {
    const [body, sig] = geocode.signLocation(place).split('.');
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    payload.a = 28.6139; // pretend it is Delhi
    const forged = `${Buffer.from(JSON.stringify(payload)).toString('base64url')}.${sig}`;
    expect(geocode.verifyLocation(forged)).toEqual({ error: 'invalid' });
  });

  test('a token signed with a different key or a truncated signature is rejected', () => {
    const [body] = geocode.signLocation(place).split('.');
    expect(geocode.verifyLocation(`${body}.AAAA`)).toEqual({ error: 'invalid' });
    expect(geocode.verifyLocation(`${body}.`)).toEqual({ error: 'invalid' });
  });

  test('expired tokens are reported as expired, not invalid', () => {
    expect(geocode.verifyLocation(geocode.signLocation(place, -1000))).toEqual({ error: 'expired' });
  });

  test.each([[undefined], [null], [''], ['nonsense'], ['a.b.c'], [42], [{}], [['x']]])('garbage input %p is invalid', (input) => {
    expect(geocode.verifyLocation(input)).toEqual({ error: 'invalid' });
  });

  test('HTML in a label is stripped and impossible coordinates are refused', () => {
    const dirty = geocode.verifyLocation(geocode.signLocation({ ...place, label: 'Main St <script>alert(1)</script>' }));
    expect(dirty.location.label).not.toMatch(/<|script/i);
    expect(geocode.verifyLocation(geocode.signLocation({ ...place, lat: 123 }))).toEqual({ error: 'invalid' });
    expect(geocode.verifyLocation(geocode.signLocation({ ...place, label: '' }))).toEqual({ error: 'invalid' });
  });
});

describe('shortLabel', () => {
  test('drops the trailing country and keeps a readable address', () => {
    expect(geocode.shortLabel('Linking Road, Bandra West, Mumbai, Maharashtra, 400050, India')).toBe('Linking Road, Bandra West, Mumbai, Maharashtra, 400050');
    expect(geocode.shortLabel('Marine Drive, Mumbai, India')).toBe('Marine Drive, Mumbai');
  });

  test('truncates very long names to 120 characters', () => {
    const out = geocode.shortLabel(`${'A very long place name, '.repeat(20)}India`);
    expect(out.length).toBeLessThanOrEqual(120);
    expect(out.endsWith('…')).toBe(true);
  });

  test('empty input gives an empty label (so the result is skipped)', () => {
    expect(geocode.shortLabel('')).toBe('');
    expect(geocode.shortLabel(undefined)).toBe('');
  });
});

describe('address search (Nominatim client)', () => {
  const realFetch = global.fetch;
  let calls;
  const reply = (payload, ok = true, status = 200) => {
    global.fetch = async (url, opts) => {
      calls.push({ url: new URL(String(url)), opts });
      return { ok, status, json: async () => payload };
    };
  };
  beforeEach(() => {
    calls = [];
    geocode.clearCache();
  });
  afterAll(() => {
    global.fetch = realFetch;
  });

  const hit = (over = {}) => ({ lat: '19.0654', lon: '72.8353', display_name: 'Linking Road, Bandra West, Mumbai, India', address: { country_code: 'in' }, ...over });

  test('returns normalised, signed results; only the allowed country; sends an identifying User-Agent', async () => {
    reply([hit(), hit({ lat: '40.7', lon: '-74', display_name: 'Broadway, New York, United States', address: { country_code: 'us' } }), hit({ lat: 'x', lon: 'y' })]);
    const results = await geocode.search('  linking   road ');
    expect(results).toHaveLength(1); // New York (wrong country) and the broken record are dropped
    expect(results[0]).toMatchObject({ label: 'Linking Road, Bandra West, Mumbai', lat: 19.0654, lng: 72.8353 });
    expect(geocode.verifyLocation(results[0].token).location).toMatchObject({ label: results[0].label, lat: 19.0654, lng: 72.8353 });

    expect(calls).toHaveLength(1);
    expect(calls[0].url.pathname).toBe('/search');
    expect(calls[0].url.searchParams.get('q')).toBe('linking road'); // whitespace collapsed
    expect(calls[0].url.searchParams.get('countrycodes')).toBe('in');
    expect(calls[0].opts.headers['User-Agent']).toMatch(/^BrightTrack\//);
  });

  test('identical searches are answered from the cache (stays within the 1 request/second policy)', async () => {
    reply([hit()]);
    await geocode.search('linking road');
    await geocode.search('Linking Road');
    expect(calls).toHaveLength(1);
  });

  test('an upstream failure becomes a clean 503, never a crash or a leaked error', async () => {
    reply({}, false, 500);
    await expect(geocode.search('anything')).rejects.toMatchObject({ statusCode: 503, code: 'GEO_UNAVAILABLE' });
    global.fetch = async () => {
      throw new Error('socket hang up');
    };
    await expect(geocode.search('another thing')).rejects.toMatchObject({ statusCode: 503, code: 'GEO_UNAVAILABLE' });
  });

  test('reverse lookup keeps the point the user was actually at, with the address from the lookup', async () => {
    reply(hit({ lat: '19.06', lon: '72.83' }));
    const p = await geocode.reverse(19.0654321, 72.8353219);
    expect(p).toMatchObject({ label: 'Linking Road, Bandra West, Mumbai', lat: 19.065432, lng: 72.835322 });
    expect(geocode.verifyLocation(p.token).location.lat).toBe(19.065432);
  });

  test('reverse: nothing there -> null; outside the served country -> 400', async () => {
    reply({ error: 'Unable to geocode' });
    expect(await geocode.reverse(0.1, 0.1)).toBeNull();
    reply(hit({ address: { country_code: 'us' } }));
    await expect(geocode.reverse(40.7, -74)).rejects.toMatchObject({ statusCode: 400, code: 'OUT_OF_AREA' });
  });
});

describe('image type detection (from the bytes, not the header)', () => {
  const pad = (head) => Buffer.concat([Buffer.from(head), Buffer.alloc(32, 1)]);

  test('accepts JPEG, PNG and WebP', () => {
    expect(detectImageType(pad([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(detectImageType(pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png');
    const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.from([1, 2, 3, 4]), Buffer.from('WEBP'), Buffer.alloc(16)]);
    expect(detectImageType(webp)).toBe('image/webp');
  });

  test.each([
    ['SVG (can carry scripts)', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')],
    ['HTML', Buffer.from('<!doctype html><html><body>hi</body></html>')],
    ['GIF', Buffer.from('GIF89a......................')],
    ['PDF', Buffer.from('%PDF-1.7 ....................')],
    ['a RIFF file that is not WebP (WAV)', Buffer.concat([Buffer.from('RIFF'), Buffer.from([1, 2, 3, 4]), Buffer.from('WAVE'), Buffer.alloc(16)])],
    ['too short', Buffer.from([0xff, 0xd8, 0xff])],
    ['empty', Buffer.alloc(0)],
  ])('rejects %s', (_name, buf) => {
    expect(detectImageType(buf)).toBeNull();
  });

  test('rejects non-buffers', () => {
    expect(detectImageType('image/jpeg')).toBeNull();
    expect(detectImageType(undefined)).toBeNull();
    expect(detectImageType({})).toBeNull();
  });
});

describe('verification codes', () => {
  test('codes are always exactly 6 digits (including leading zeros)', () => {
    for (let i = 0; i < 300; i += 1) expect(generateCode()).toMatch(/^\d{6}$/);
  });

  test('the stored hash depends on both the email and the code and never contains the code', () => {
    const h = hashCode('a@gmail.com', '123456');
    expect(h).toMatch(/^[a-f0-9]{64}$/);
    expect(h).not.toContain('123456');
    expect(hashCode('a@gmail.com', '123457')).not.toBe(h);
    expect(hashCode('b@gmail.com', '123456')).not.toBe(h);
    expect(hashCode('a@gmail.com', '123456')).toBe(h);
  });
});
