const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const createApp = require('../src/app');
const User = require('../src/models/User');

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
}

// supertest agent that keeps cookies and always sends the CSRF header
const agent = () => request.agent(app).set('X-Requested-With', 'XMLHttpRequest');

const validUser = (over = {}) => ({
  name: 'Asha Rao',
  email: 'asha@example.com',
  phone: '9876543210',
  password: 'Password123',
  confirmPassword: 'Password123',
  ...over,
});

const validComplaint = (over = {}) => ({
  location: 'MG Road, near City Mall',
  pole: 'MG-114',
  type: 'Not working',
  description: 'The lamp has been off for several nights.',
  unsafe: true,
  ...over,
});

async function registeredAgent(over) {
  const a = agent();
  const res = await a.post('/api/auth/register').send(validUser(over));
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return a;
}

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

module.exports = { app, startDb, stopDb, clearDb, agent, validUser, validComplaint, registeredAgent, adminAgent };
