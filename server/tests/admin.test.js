const { startDb, stopDb, clearDb, agent, validComplaint, place, registeredAgent, adminAgent, makeTechnician } = require('./helpers');
const Technician = require('../src/models/Technician');

beforeAll(startDb);
afterAll(stopDb);
afterEach(clearDb);

async function seedOne(resident, over) {
  const { body } = await resident.post('/api/complaints').send(validComplaint(over));
  return body.data.complaint.complaintId;
}

// Assign a technician from the managed list (creates the default one on first use).
async function assign(admin, id, tech) {
  const t = tech || (await Technician.findOne({ name: 'Ramesh Patil' })) || (await makeTechnician());
  return admin.patch(`/api/admin/complaints/${id}/assign`).send({ technicianId: String(t._id) });
}
const resolve = (admin, id, resolutionNote = 'Replaced the lamp and tested it after sunset.') =>
  admin.patch(`/api/admin/complaints/${id}/status`).send({ status: 'Resolved', resolutionNote });

describe('admin permissions', () => {
  test('anonymous gets 401 and a resident gets 403 on every admin route', async () => {
    const resident = await registeredAgent();
    const id = await seedOne(resident);
    const tech = await makeTechnician();
    const calls = [
      (a) => a.get('/api/admin/complaints'),
      (a) => a.get('/api/admin/complaints/export'),
      (a) => a.get('/api/admin/hotspots'),
      (a) => a.get('/api/admin/technicians'),
      (a) => a.post('/api/admin/technicians').send({ name: 'New Person' }),
      (a) => a.patch(`/api/admin/technicians/${tech._id}`).send({ active: false }),
      (a) => a.patch(`/api/admin/complaints/${id}/status`).send({ status: 'Resolved' }),
      (a) => a.patch(`/api/admin/complaints/${id}/assign`).send({ technicianId: String(tech._id) }),
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
    expect((await Technician.findById(tech._id)).active).toBe(true);
  });
});

describe('technician management', () => {
  test('admin adds technicians, lists them with open-job counts, and deactivates one', async () => {
    const admin = await adminAgent();
    const resident = await registeredAgent();

    const created = await admin.post('/api/admin/technicians').send({ name: '  Ramesh Patil ', phone: '9876543210', area: 'Bandra' });
    expect(created.status).toBe(201);
    expect(created.body.data.technician).toMatchObject({ name: 'Ramesh Patil', phone: '9876543210', area: 'Bandra', active: true, openJobs: 0 });
    const second = await admin.post('/api/admin/technicians').send({ name: 'Sunita Sharma' });
    expect(second.status).toBe(201);

    const id = await seedOne(resident);
    await admin.patch(`/api/admin/complaints/${id}/assign`).send({ technicianId: created.body.data.technician.id });

    const list = await admin.get('/api/admin/technicians');
    expect(list.status).toBe(200);
    const byName = Object.fromEntries(list.body.data.technicians.map((t) => [t.name, t]));
    expect(byName['Ramesh Patil'].openJobs).toBe(1);
    expect(byName['Sunita Sharma'].openJobs).toBe(0);

    const off = await admin.patch(`/api/admin/technicians/${second.body.data.technician.id}`).send({ active: false, area: 'Powai' });
    expect(off.status).toBe(200);
    expect(off.body.data.technician).toMatchObject({ active: false, area: 'Powai' });
    const after = (await admin.get('/api/admin/technicians')).body.data.technicians;
    expect(after[after.length - 1].name).toBe('Sunita Sharma'); // inactive technicians sort last
  });

  test('validation: short name, bad phone, duplicate name (case-insensitive), empty update, bad or unknown id', async () => {
    const admin = await adminAgent();
    const tech = await makeTechnician({ name: 'Ramesh Patil' });
    expect((await admin.post('/api/admin/technicians').send({ name: 'R' })).status).toBe(400);
    expect((await admin.post('/api/admin/technicians').send({ name: 'Valid Name', phone: '12345' })).status).toBe(400);
    const dup = await admin.post('/api/admin/technicians').send({ name: 'ramesh PATIL' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.details[0].field).toBe('name');
    expect((await admin.patch(`/api/admin/technicians/${tech._id}`).send({})).status).toBe(400);
    expect((await admin.patch('/api/admin/technicians/not-an-id').send({ active: false })).status).toBe(400);
    expect((await admin.patch('/api/admin/technicians/aaaaaaaaaaaaaaaaaaaaaaaa').send({ active: false })).status).toBe(404);

    const other = await makeTechnician({ name: 'Sunita Sharma' });
    expect((await admin.patch(`/api/admin/technicians/${other._id}`).send({ name: 'ramesh patil' })).status).toBe(409);
    expect((await admin.patch(`/api/admin/technicians/${tech._id}`).send({ name: 'RAMESH PATIL' })).status).toBe(200); // renaming to its own name is fine
    expect((await admin.patch(`/api/admin/technicians/${tech._id}`).send({ phone: '' })).status).toBe(200); // '' clears the phone
  });

  test('an inactive or unknown technician cannot be assigned', async () => {
    const resident = await registeredAgent();
    const admin = await adminAgent();
    const id = await seedOne(resident);
    const gone = await makeTechnician({ name: 'Retired Tech', active: false });

    const inactive = await assign(admin, id, gone);
    expect(inactive.status).toBe(400);
    expect(inactive.body.error.code).toBe('TECHNICIAN_UNAVAILABLE');
    const unknown = await admin.patch(`/api/admin/complaints/${id}/assign`).send({ technicianId: 'aaaaaaaaaaaaaaaaaaaaaaaa' });
    expect(unknown.status).toBe(400);
    expect(unknown.body.error.code).toBe('TECHNICIAN_UNAVAILABLE');
    expect((await admin.patch(`/api/admin/complaints/${id}/assign`).send({ technicianId: 'free text name' })).status).toBe(400);
    expect((await admin.patch(`/api/admin/complaints/${id}/assign`).send({})).status).toBe(400);
    expect((await resident.get(`/api/complaints/mine/${id}`)).body.data.complaint.status).toBe('Pending');
  });
});

describe('repair workflow: assign a technician, then resolve with a note', () => {
  test('assigning moves Pending to In Progress, stores the technician and logs who and when', async () => {
    const resident = await registeredAgent();
    const admin = await adminAgent();
    const id = await seedOne(resident);
    const tech = await makeTechnician();

    const res = await assign(admin, id, tech);
    expect(res.status).toBe(200);
    const c = res.body.data.complaint;
    expect(c.status).toBe('In Progress');
    expect(c.assignedTo).toBe('Ramesh Patil');
    expect(String(c.technician)).toBe(String(tech._id));
    expect(c.history).toHaveLength(2);
    expect(c.history[1]).toMatchObject({ status: 'In Progress', note: 'Assigned to Ramesh Patil' });
    expect(c.history[1].changedBy.name).toBe('Admin');
    expect(new Date(c.history[1].at).getTime()).not.toBeNaN();
  });

  test('resolving needs a technician and a real resolution note', async () => {
    const resident = await registeredAgent();
    const admin = await adminAgent();
    const id = await seedOne(resident);

    const noTech = await resolve(admin, id);
    expect(noTech.status).toBe(400);
    expect(noTech.body.error.code).toBe('NEEDS_TECHNICIAN');
    expect((await admin.patch(`/api/admin/complaints/${id}/status`).send({ status: 'In Progress' })).body.error.code).toBe('NEEDS_TECHNICIAN');

    await assign(admin, id);
    const noNote = await admin.patch(`/api/admin/complaints/${id}/status`).send({ status: 'Resolved' });
    expect(noNote.status).toBe(400);
    expect(noNote.body.error.details[0].field).toBe('resolutionNote');
    expect((await resolve(admin, id, 'done')).status).toBe(400);
    expect((await resident.get(`/api/complaints/mine/${id}`)).body.data.complaint.status).toBe('In Progress');

    const ok = await resolve(admin, id);
    expect(ok.status).toBe(200);
    expect(ok.body.data.complaint).toMatchObject({ status: 'Resolved', resolutionNote: 'Replaced the lamp and tested it after sunset.' });
    expect(ok.body.data.complaint.resolvedAt).toBeTruthy();
    expect(ok.body.data.complaint.history[2].note).toMatch(/Replaced the lamp/);
  });

  test('the resident sees the technician and what was fixed; history notes stay internal', async () => {
    const resident = await registeredAgent();
    const admin = await adminAgent();
    const id = await seedOne(resident);
    await assign(admin, id);
    await resolve(admin, id);

    const mine = (await resident.get(`/api/complaints/mine/${id}`)).body.data.complaint;
    expect(mine).toMatchObject({ status: 'Resolved', assignedTo: 'Ramesh Patil', resolutionNote: 'Replaced the lamp and tested it after sunset.' });
    expect(mine.history).toHaveLength(3);
    mine.history.forEach((h) => {
      expect(h.changedBy).toBeUndefined();
      expect(h.note).toBeUndefined();
    });
  });

  test('public tracking shows what was fixed but never the technician or admin', async () => {
    const resident = await registeredAgent();
    const admin = await adminAgent();
    const id = await seedOne(resident);
    await assign(admin, id);
    await resolve(admin, id);

    const pub = await agent().get(`/api/complaints/track/${id}`);
    expect(pub.body.data.complaint.resolutionNote).toMatch(/Replaced the lamp/);
    expect(JSON.stringify(pub.body)).not.toMatch(/Ramesh|Patil|Admin|assignedTo|technician/i);
  });

  test('reassigning an in-progress complaint changes the technician without a duplicate history entry', async () => {
    const resident = await registeredAgent();
    const admin = await adminAgent();
    const id = await seedOne(resident);
    await assign(admin, id, await makeTechnician({ name: 'Ramesh Patil' }));
    const again = await assign(admin, id, await makeTechnician({ name: 'Sunita Sharma' }));
    expect(again.status).toBe(200);
    expect(again.body.data.complaint.assignedTo).toBe('Sunita Sharma');
    expect(again.body.data.complaint.history).toHaveLength(2);
  });

  test('assign 404s on unknown complaints and refuses resolved ones', async () => {
    const resident = await registeredAgent();
    const admin = await adminAgent();
    const id = await seedOne(resident);
    expect((await assign(admin, 'BT-ZZZZZ')).status).toBe(404);
    await assign(admin, id);
    await resolve(admin, id);
    const late = await assign(admin, id);
    expect(late.status).toBe(400);
    expect(late.body.error.code).toBe('ALREADY_RESOLVED');
  });

  test('reopening clears the resolution but keeps it in the history', async () => {
    const resident = await registeredAgent();
    const admin = await adminAgent();
    const id = await seedOne(resident);
    await assign(admin, id);
    await resolve(admin, id);

    const reopen = await admin.patch(`/api/admin/complaints/${id}/status`).send({ status: 'In Progress' });
    expect(reopen.status).toBe(200);
    const c = reopen.body.data.complaint;
    expect(c.status).toBe('In Progress');
    expect(c.resolutionNote).toBeUndefined();
    expect(c.resolvedAt).toBeUndefined();
    expect(c.history).toHaveLength(4);
    expect(c.history[2].note).toMatch(/Replaced the lamp/);
    expect(c.history[3].note).toBe('Reopened');
  });

  test('a note sent with a non-Resolved status is ignored', async () => {
    const resident = await registeredAgent();
    const admin = await adminAgent();
    const id = await seedOne(resident);
    await assign(admin, id);
    const res = await admin.patch(`/api/admin/complaints/${id}/status`).send({ status: 'Pending', resolutionNote: 'should be ignored' });
    expect(res.status).toBe(200);
    expect(res.body.data.complaint.resolutionNote).toBeUndefined();
  });

  test('rejects invalid status (400), same status (400) and unknown complaint (404)', async () => {
    const resident = await registeredAgent();
    const admin = await adminAgent();
    const id = await seedOne(resident);
    expect((await admin.patch(`/api/admin/complaints/${id}/status`).send({ status: 'Done' })).status).toBe(400);
    expect((await admin.patch(`/api/admin/complaints/${id}/status`).send({ status: 'Pending' })).status).toBe(400);
    expect((await admin.patch('/api/admin/complaints/BT-ZZZZZ/status').send({ status: 'In Progress' })).status).toBe(404);
  });
});

describe('admin tools', () => {
  // $first/$max accumulators are not implemented by FerretDB, so skip when TEST_MONGODB_URI points at one.
  const mongoOnly = process.env.SKIP_AGGREGATE_TESTS ? test.skip : test;

  mongoOnly('hotspots group reports from the same spot (about 100 m, so GPS jitter still matches)', async () => {
    const resident = await registeredAgent();
    const admin = await adminAgent();
    await seedOne(resident, { place: place('Powai Lake Garden, Powai, Mumbai', 19.0761, 72.8777) });
    await seedOne(resident, { place: place('Powai Lake Garden (another search result)', 19.0762, 72.8778) });
    await seedOne(resident, { place: place('Dadar Station Road', 19.0186, 72.8424) });
    const hot = await admin.get('/api/admin/hotspots');
    expect(hot.status).toBe(200);
    expect(hot.body.data.hotspots).toHaveLength(1);
    expect(hot.body.data.hotspots[0]).toMatchObject({ count: 2, open: 2 });
  });

  test('list supports search, status filter, sorting and pagination', async () => {
    const resident = await registeredAgent();
    const admin = await adminAgent();
    const ids = [];
    for (let i = 0; i < 5; i += 1) ids.push(await seedOne(resident, { place: place(`Street number ${i}`, 19 + i * 0.01, 72.8) }));
    await assign(admin, ids[0]);
    await resolve(admin, ids[0]);

    const page = await admin.get('/api/admin/complaints?limit=2&page=2&sort=location&order=asc');
    expect(page.body.data.complaints).toHaveLength(2);
    expect(page.body.meta).toMatchObject({ page: 2, limit: 2, total: 5, pages: 3 });
    expect(page.body.data.complaints[0].location).toBe('Street number 2');

    expect((await admin.get('/api/admin/complaints?status=Resolved')).body.meta.total).toBe(1);
    expect((await admin.get('/api/admin/complaints?search=number%203')).body.meta.total).toBe(1);
    expect((await admin.get('/api/admin/complaints?search=.*')).body.meta.total).toBe(0); // regex chars are escaped
    expect((await admin.get('/api/admin/complaints?search=ramesh')).body.meta.total).toBe(1); // searches technician names
    expect((await admin.get('/api/admin/complaints?status=Bogus')).status).toBe(400);
  });

  test('note, delete and CSV export', async () => {
    const resident = await registeredAgent();
    const admin = await adminAgent();
    const id = await seedOne(resident, { place: place('Lake View Park, Powai', 19.1, 72.9) });
    await seedOne(resident, { place: place('Lake View Park, Powai', 19.1, 72.9) });
    await seedOne(resident, { place: place('Elsewhere', 19.2, 72.95), description: '=HYPERLINK("http://evil","x") is my text' });

    await assign(admin, id, await makeTechnician({ name: 'Imran Sheikh' }));
    await resolve(admin, id, 'Swapped the photocell and tested.');
    const note = await admin.patch(`/api/admin/complaints/${id}/note`).send({ note: 'Crew assigned' });
    expect(note.body.data.complaint.adminNote).toBe('Crew assigned');

    const csv = await admin.get('/api/admin/complaints/export');
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.text).toContain('Crew assigned');
    expect(csv.text).toContain('Imran Sheikh');
    expect(csv.text).toContain('Swapped the photocell');
    expect(csv.text).toContain('19.1'); // coordinates are exported
    expect(csv.text).toContain(`"'=HYPERLINK`); // formula injection neutralised

    expect((await admin.delete(`/api/admin/complaints/${id}`)).status).toBe(200);
    expect((await admin.delete(`/api/admin/complaints/${id}`)).status).toBe(404);
  });
});
