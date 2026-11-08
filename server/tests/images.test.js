const request = require('supertest');
const { app, startDb, stopDb, clearDb, agent, validComplaint, registeredAgent, adminAgent } = require('./helpers');
const Image = require('../src/models/Image');
const Complaint = require('../src/models/Complaint');

beforeAll(startDb);
afterAll(stopDb);
afterEach(clearDb);

// Tiny buffers that start with the real magic bytes of each format.
const jpeg = (n = 64, fill = 7) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(n, fill)]);
const png = () => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 9)]);
const webp = () => Buffer.concat([Buffer.from('RIFF'), Buffer.from([1, 2, 3, 4]), Buffer.from('WEBP'), Buffer.alloc(32, 3)]);

async function newComplaint(a) {
  return (await a.post('/api/complaints').send(validComplaint())).body.data.complaint.complaintId;
}
const upload = (a, id, buf, type = 'image/jpeg') => a.post(`/api/complaints/${id}/images`).set('Content-Type', type).send(buf);

describe('uploading photos', () => {
  test('the owner uploads JPEG, PNG and WebP photos; bytes round-trip and the complaint lists them', async () => {
    const a = await registeredAgent();
    const id = await newComplaint(a);
    const bytes = jpeg(100, 5);

    const first = await upload(a, id, bytes);
    expect(first.status).toBe(201);
    expect(first.body.data.image).toMatchObject({ contentType: 'image/jpeg', size: bytes.length });
    expect((await upload(a, id, png(), 'image/png')).status).toBe(201);
    const third = await upload(a, id, webp(), 'image/webp');
    expect(third.status).toBe(201);
    expect(third.body.data.images).toHaveLength(3);

    const mine = (await a.get(`/api/complaints/mine/${id}`)).body.data.complaint;
    expect(mine.images.map((i) => i.contentType)).toEqual(['image/jpeg', 'image/png', 'image/webp']);
    expect(JSON.stringify(mine)).not.toMatch(/"data"/); // metadata only, never the bytes

    const got = await a.get(`/api/images/${first.body.data.image.id}`).buffer(true).parse((res, cb) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(got.status).toBe(200);
    expect(got.headers['content-type']).toBe('image/jpeg');
    expect(got.headers['cache-control']).toMatch(/private/);
    expect(got.headers['cross-origin-resource-policy']).toBe('cross-origin'); // lets the frontend (another domain in production) show it
    expect(Buffer.compare(got.body, bytes)).toBe(0);
  });

  test('the file type comes from the bytes: scripts, SVG, GIF and text are refused even when labelled image/jpeg', async () => {
    const a = await registeredAgent();
    const id = await newComplaint(a);
    const bad = [
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
      Buffer.from('<html><script>alert(1)</script></html>'),
      Buffer.from('GIF89a......................'),
      Buffer.from('just some text pretending to be a photo'),
    ];
    for (const buf of bad) {
      // eslint-disable-next-line no-await-in-loop
      const res = await upload(a, id, buf);
      expect(res.status).toBe(415);
      expect(res.body.error.code).toBe('UNSUPPORTED_IMAGE');
    }
    expect(await Image.countDocuments()).toBe(0);
  });

  test('content types that are not photos (gif, json, no body) are refused with 415', async () => {
    const a = await registeredAgent();
    const id = await newComplaint(a);
    expect((await upload(a, id, jpeg(), 'image/gif')).status).toBe(415);
    expect((await a.post(`/api/complaints/${id}/images`).set('Content-Type', 'application/json').send({ x: 1 })).status).toBe(415);
    expect((await a.post(`/api/complaints/${id}/images`).set('Content-Type', 'image/jpeg').send(Buffer.alloc(0))).status).toBe(415);
  });

  test('files over 2 MB are refused with 413 before anything is stored', async () => {
    const a = await registeredAgent();
    const id = await newComplaint(a);
    // The server may answer 413 or simply hang up while we are still sending: both mean "refused".
    const res = await upload(a, id, jpeg(2 * 1024 * 1024 + 10)).catch((err) => ({ status: 413, hungUp: err.code }));
    expect(res.status).toBe(413);
    expect(await Image.countDocuments()).toBe(0);
  });

  test('at most 3 photos per complaint', async () => {
    const a = await registeredAgent();
    const id = await newComplaint(a);
    for (let i = 0; i < 3; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      expect((await upload(a, id, jpeg(50 + i))).status).toBe(201);
    }
    const fourth = await upload(a, id, jpeg(99));
    expect(fourth.status).toBe(400);
    expect(fourth.body.error.code).toBe('IMAGE_LIMIT');
    expect(await Image.countDocuments()).toBe(3);
  });

  test('the limit holds even when uploads arrive at the same moment', async () => {
    const a = await registeredAgent();
    const id = await newComplaint(a);
    const results = await Promise.all([1, 2, 3, 4, 5, 6].map((n) => upload(a, id, jpeg(40 + n))));
    expect(results.filter((r) => r.status === 201)).toHaveLength(3);
    expect(results.filter((r) => r.status === 400)).toHaveLength(3);
    expect(await Image.countDocuments()).toBe(3); // the rejected ones were cleaned up
    expect((await Complaint.findOne({ complaintId: id })).images).toHaveLength(3);
  });

  test('login is required, the CSRF header is required, and only the owner can add photos', async () => {
    const alice = await registeredAgent();
    const bob = await registeredAgent({ email: 'bob@gmail.com', name: 'Bob Kumar' });
    const id = await newComplaint(alice);
    expect((await upload(agent(), id, jpeg())).status).toBe(401);
    expect((await upload(bob, id, jpeg())).status).toBe(404); // not 403: IDs cannot be probed
    const noHeader = await request(app).post(`/api/complaints/${id}/images`).set('Content-Type', 'image/jpeg').send(jpeg());
    expect(noHeader.status).toBe(403); // no X-Requested-With header
    expect(noHeader.body.error.code).toBe('CSRF');
    expect((await upload(alice, 'BT-ZZZZZ', jpeg())).status).toBe(404);
    expect((await upload(alice, 'bad-id', jpeg())).status).toBe(400);
    expect(await Image.countDocuments()).toBe(0);
  });

  test('photos cannot be added to a resolved complaint', async () => {
    const a = await registeredAgent();
    const id = await newComplaint(a);
    await Complaint.updateOne({ complaintId: id }, { status: 'Resolved' });
    const res = await upload(a, id, jpeg());
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('RESOLVED');
  });
});

describe('who can see photos', () => {
  async function withPhoto() {
    const alice = await registeredAgent();
    const id = await newComplaint(alice);
    const imageId = (await upload(alice, id, jpeg())).body.data.image.id;
    return { alice, id, imageId };
  }

  test('the owner and an admin can open it; anonymous users get 401 and other residents 404', async () => {
    const { alice, imageId } = await withPhoto();
    const bob = await registeredAgent({ email: 'bob@gmail.com', name: 'Bob Kumar' });
    const admin = await adminAgent();
    expect((await alice.get(`/api/images/${imageId}`)).status).toBe(200);
    expect((await admin.get(`/api/images/${imageId}`)).status).toBe(200);
    expect((await agent().get(`/api/images/${imageId}`)).status).toBe(401);
    expect((await bob.get(`/api/images/${imageId}`)).status).toBe(404);
    expect((await alice.get('/api/images/000000000000000000000000')).status).toBe(404);
    expect((await alice.get('/api/images/not-an-id')).status).toBe(400);
  });

  test('photos never appear on the public tracking page or the public lists', async () => {
    const { id } = await withPhoto();
    const pub = await agent().get(`/api/complaints/track/${id}`);
    expect(JSON.stringify(pub.body)).not.toMatch(/image|photo/i);
    const recent = await agent().get('/api/complaints/recent');
    expect(JSON.stringify(recent.body)).not.toMatch(/image|photo/i);
  });

  test('admins see photo metadata (not bytes) on the complaint list', async () => {
    const { imageId } = await withPhoto();
    const admin = await adminAgent();
    const list = await admin.get('/api/admin/complaints');
    const c = list.body.data.complaints[0];
    expect(c.images).toEqual([{ id: imageId, contentType: 'image/jpeg', size: expect.any(Number) }]);
    expect(JSON.stringify(c)).not.toMatch(/"data"/); // no image bytes inside the complaint
  });
});

describe('removing photos', () => {
  test('the owner can remove a photo; it is deleted from storage; others cannot', async () => {
    const alice = await registeredAgent();
    const bob = await registeredAgent({ email: 'bob@gmail.com', name: 'Bob Kumar' });
    const id = await newComplaint(alice);
    const one = (await upload(alice, id, jpeg(30))).body.data.image.id;
    const two = (await upload(alice, id, jpeg(31))).body.data.image.id;

    expect((await bob.delete(`/api/complaints/${id}/images/${one}`)).status).toBe(404);
    expect((await agent().delete(`/api/complaints/${id}/images/${one}`)).status).toBe(401);

    const del = await alice.delete(`/api/complaints/${id}/images/${one}`);
    expect(del.status).toBe(200);
    expect(del.body.data.images.map((i) => i.id)).toEqual([two]);
    expect(await Image.findById(one)).toBeNull();
    expect((await alice.get(`/api/images/${one}`)).status).toBe(404);
    expect((await alice.delete(`/api/complaints/${id}/images/${one}`)).status).toBe(404); // already gone
  });

  test('a photo cannot be removed through a different complaint', async () => {
    const alice = await registeredAgent();
    const first = await newComplaint(alice);
    const second = await newComplaint(alice);
    const imageId = (await upload(alice, first, jpeg())).body.data.image.id;
    expect((await alice.delete(`/api/complaints/${second}/images/${imageId}`)).status).toBe(404);
    expect(await Image.findById(imageId)).not.toBeNull();
  });

  test('resolved complaints keep their photos untouched', async () => {
    const alice = await registeredAgent();
    const id = await newComplaint(alice);
    const imageId = (await upload(alice, id, jpeg())).body.data.image.id;
    await Complaint.updateOne({ complaintId: id }, { status: 'Resolved' });
    const res = await alice.delete(`/api/complaints/${id}/images/${imageId}`);
    expect(res.status).toBe(400);
    expect(await Image.findById(imageId)).not.toBeNull();
  });

  test('when an admin deletes a complaint its photos are deleted too', async () => {
    const alice = await registeredAgent();
    const admin = await adminAgent();
    const id = await newComplaint(alice);
    await upload(alice, id, jpeg(10));
    await upload(alice, id, jpeg(11));
    expect(await Image.countDocuments()).toBe(2);
    expect((await admin.delete(`/api/admin/complaints/${id}`)).status).toBe(200);
    expect(await Image.countDocuments()).toBe(0);
  });
});
