const { startDb, stopDb, clearDb, agent, validComplaint, registeredAgent, adminAgent } = require('./helpers');

beforeAll(startDb);
afterAll(stopDb);
afterEach(clearDb);

async function seedOne(resident, over) {
  const { body } = await resident.post('/api/complaints').send(validComplaint(over));
  return body.data.complaint.complaintId;
}

describe('admin permissions', () => {
  test('anonymous gets 401 and a resident gets 403 on every admin route', async () => {
    const resident = await registeredAgent();
    const id = await seedOne(resident);
    const calls = [
      (a) => a.get('/api/admin/complaints'),
      (a) => a.get('/api/admin/complaints/export'),
      (a) => a.get('/api/admin/hotspots'),
      (a) => a.patch(`/api/admin/complaints/${id}/status`).send({ status: 'Resolved' }),
      (a) => a.patch(`/api/admin/complaints/${id}/note`).send({ note: 'x' }),
      (a) => a.delete(`/api/admin/complaints/${id}`),
    ];
    for (const call of calls) {
      // eslint-disable-next-line no-await-in-loop
      expect((await call(agent())).status).toBe(401);
      // eslint-disable-next-line no-await-in-loop
      expect((await call(resident)).status).toBe(403);
    }
    expect((await resident.get(`/api/complaints/mine/${id}`)).body.data.complaint.status).toBe('Pending');
  });
});

describe('admin status updates', () => {
  test('changes status, records who and when in history, resident sees it without admin identity', async () => {
    const resident = await registeredAgent();
    const admin = await adminAgent();
    const id = await seedOne(resident);

    const res = await admin.patch(`/api/admin/complaints/${id}/status`).send({ status: 'In Progress' });
    expect(res.status).toBe(200);
    const { history, status } = res.body.data.complaint;
    expect(status).toBe('In Progress');
    expect(history).toHaveLength(2);
    expect(history[1].changedBy.name).toBe('Admin');
    expect(new Date(history[1].at).getTime()).not.toBeNaN();

    const mine = await resident.get(`/api/complaints/mine/${id}`);
    expect(mine.body.data.complaint.status).toBe('In Progress');
    expect(mine.body.data.complaint.history[1].changedBy).toBeUndefined();
  });

  test('rejects invalid status (400), same status (400) and unknown complaint (404)', async () => {
    const resident = await registeredAgent();
    const admin = await adminAgent();
    const id = await seedOne(resident);
    expect((await admin.patch(`/api/admin/complaints/${id}/status`).send({ status: 'Done' })).status).toBe(400);
    expect((await admin.patch(`/api/admin/complaints/${id}/status`).send({ status: 'Pending' })).status).toBe(400);
    expect((await admin.patch('/api/admin/complaints/BT-ZZZZZ/status').send({ status: 'Resolved' })).status).toBe(404);
  });
});

describe('admin tools', () => {
  // $first/$max accumulators are not implemented by FerretDB, so skip when TEST_MONGODB_URI points at one.
  const mongoOnly = process.env.SKIP_AGGREGATE_TESTS ? test.skip : test;

  mongoOnly('hotspots lists locations reported more than once (case/space-insensitive)', async () => {
    const resident = await registeredAgent();
    const admin = await adminAgent();
    await seedOne(resident, { location: 'Lake View Park' });
    await seedOne(resident, { location: '  lake   view park ' });
    await seedOne(resident, { location: 'Elsewhere' });
    const hot = await admin.get('/api/admin/hotspots');
    expect(hot.status).toBe(200);
    expect(hot.body.data.hotspots).toHaveLength(1);
    expect(hot.body.data.hotspots[0]).toMatchObject({ count: 2, open: 2 });
  });

  test('list supports search, status filter, sorting and pagination', async () => {
    const resident = await registeredAgent();
    const admin = await adminAgent();
    const ids = [];
    for (let i = 0; i < 5; i += 1) ids.push(await seedOne(resident, { location: `Street number ${i}` }));
    await admin.patch(`/api/admin/complaints/${ids[0]}/status`).send({ status: 'Resolved' });

    const page = await admin.get('/api/admin/complaints?limit=2&page=2&sort=location&order=asc');
    expect(page.body.data.complaints).toHaveLength(2);
    expect(page.body.meta).toMatchObject({ page: 2, limit: 2, total: 5, pages: 3 });
    expect(page.body.data.complaints[0].location).toBe('Street number 2');

    expect((await admin.get('/api/admin/complaints?status=Resolved')).body.meta.total).toBe(1);
    expect((await admin.get('/api/admin/complaints?search=number%203')).body.meta.total).toBe(1);
    expect((await admin.get('/api/admin/complaints?search=.*')).body.meta.total).toBe(0); // regex chars are escaped
    expect((await admin.get('/api/admin/complaints?status=Bogus')).status).toBe(400);
  });

  test('note, delete and CSV export', async () => {
    const resident = await registeredAgent();
    const admin = await adminAgent();
    const id = await seedOne(resident, { location: 'Lake View Park' });
    await seedOne(resident, { location: '  lake view park ' });
    await seedOne(resident, { location: 'Elsewhere', description: '=HYPERLINK("http://evil","x") is my text' });

    const note = await admin.patch(`/api/admin/complaints/${id}/note`).send({ note: 'Crew assigned' });
    expect(note.body.data.complaint.adminNote).toBe('Crew assigned');

    const csv = await admin.get('/api/admin/complaints/export');
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.text).toContain('Crew assigned');
    expect(csv.text).toContain(`"'=HYPERLINK`); // formula injection neutralised

    expect((await admin.delete(`/api/admin/complaints/${id}`)).status).toBe(200);
    expect((await admin.delete(`/api/admin/complaints/${id}`)).status).toBe(404);
  });
});
