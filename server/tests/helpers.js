const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const createApp = require('../src/app');
const User = require('../src/models/User');
const Technician = require('../src/models/Technician');
const mailer = require('../src/utils/mailer');
const { signLocation } = require('../src/utils/geocode');

let mongod;
const app = createApp();

// Set TEST_MONGODB_URI to use an existing MongoDB instead of downloading an in-memory one.
async function startDb() {
  if (process.env.TEST_MONGODB_URI) {
    await mongoose.connect(process.env.TEST_MONGODB_URI, { dbName: `brighttrack_test_${process.pid}_${Date.now()}` });
  } else {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
  }
  await Promise.all(Object.values(mongoose.models).map((m) => m.init())); // build unique indexes
}

async function stopDb() {
  if (process.env.TEST_MONGODB_URI) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
}

async function clearDb() {
  await Promise.all(Object.values(mongoose.models).map((m) => m.deleteMany({})));
  mailer.outbox.length = 0;
}

// supertest agent that keeps cookies and always sends the CSRF header
const agent = () => request.agent(app).set('X-Requested-With', 'XMLHttpRequest');

const validUser = (over = {}) => ({
  name: 'Asha Rao',
  email: 'asha@gmail.com',
  phone: '9876543210',
  password: 'Password123',
  confirmPassword: 'Password123',
  ...over,
});

// A "place" as returned by the address search. Complaints must carry a server-signed token for one.
const place = (label = 'MG Road, near City Mall, Mumbai', lat = 19.076, lng = 72.8777) => ({ label, lat, lng });

// validComplaint({ place: place('Somewhere', 19.1, 72.9) }) changes the location; other keys override fields.
const validComplaint = (over = {}) => {
  const { place: p, ...rest } = over;
  return {
    locationToken: signLocation(p || place()),
    pole: 'MG-114',
    type: 'Not working',
    description: 'The lamp has been off for several nights.',
    unsafe: true,
    ...rest,
  };
};

// The 6-digit code that would have been emailed to this address.
function lastCodeFor(email) {
  const mail = [...mailer.outbox].reverse().find((m) => m.to === String(email).toLowerCase());
  if (!mail) throw new Error(`no email was sent to ${email}`);
  return mail.meta.code;
}

// Registers AND verifies the email (the way a real person must), returning a logged-in agent.
async function registeredAgent(over) {
  const a = agent();
  const body = validUser(over);
  const reg = await a.post('/api/auth/register').send(body);
  if (reg.status !== 201) throw new Error(`register failed: ${reg.status} ${JSON.stringify(reg.body)}`);
  const email = body.email.toLowerCase();
  const ver = await a.post('/api/auth/verify-email').send({ email, code: lastCodeFor(email) });
  if (ver.status !== 200) throw new Error(`verify failed: ${ver.status} ${JSON.stringify(ver.body)}`);
  return a;
}

const makeTechnician = (over = {}) => Technician.create({ name: 'Ramesh Patil', area: 'Zone A', ...over });

async function adminAgent() {
  await User.create({
    name: 'Admin',
    email: 'admin@example.com',
    role: 'admin',
    passwordHash: await User.hashPassword('AdminPass123'),
  });
  const a = agent();
  const res = await a.post('/api/auth/login').send({ email: 'admin@example.com', password: 'AdminPass123' });
  if (res.status !== 200) throw new Error('admin login failed');
  return a;
}

module.exports = { app, startDb, stopDb, clearDb, agent, validUser, validComplaint, place, lastCodeFor, registeredAgent, adminAgent, makeTechnician };
