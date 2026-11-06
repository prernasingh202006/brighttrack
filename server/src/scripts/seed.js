// Seeds one admin, one demo resident and sample complaints.  Usage: npm run seed
// The admin password comes from SEED_ADMIN_PASSWORD and is REQUIRED in production.
const env = require('../config/env');
const { connectDb, disconnectDb } = require('../config/db');
const User = require('../models/User');
const Complaint = require('../models/Complaint');
const { generateComplaintId } = require('../utils/helpers');

const DAY = 24 * 60 * 60 * 1000;

async function upsertUser({ name, email, password, role }) {
  let user = await User.findOne({ email });
  if (user) {
    console.log(`  exists: ${email} (${user.role})`);
    return user;
  }
  user = await User.create({ name, email, role, passwordHash: await User.hashPassword(password) });
  console.log(`  created ${role}: ${email}`);
  return user;
}

async function main() {
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (env.isProd && !adminPassword) throw new Error('Set SEED_ADMIN_PASSWORD when seeding in production');

  await connectDb(env.MONGODB_URI);
  console.log('Seeding users...');
  const admin = await upsertUser({
    name: process.env.SEED_ADMIN_NAME || 'BrightTrack Admin',
    email: (process.env.SEED_ADMIN_EMAIL || 'admin@brighttrack.local').toLowerCase(),
    password: adminPassword || 'ChangeMe123!',
    role: 'admin',
  });

  if (env.isProd) {
    console.log('Production: skipping demo resident and sample complaints.');
    return;
  }
  const resident = await upsertUser({ name: 'Demo Resident', email: 'resident@brighttrack.local', password: 'Resident123!', role: 'resident' });

  if ((await Complaint.countDocuments()) > 0) {
    console.log('Complaints already exist, skipping samples.');
    return;
  }
  const now = Date.now();
  const mk = (daysAgo, location, type, description, unsafe, statuses, pole) => {
    const history = statuses.map((status, i) => ({
      status,
      changedBy: i === 0 ? resident._id : admin._id,
      at: new Date(now - (daysAgo - i * 0.8) * DAY),
    }));
    return {
      complaintId: generateComplaintId(), user: resident._id, location, pole, type, description, unsafe,
      status: statuses[statuses.length - 1], history, createdAt: history[0].at, updatedAt: history[history.length - 1].at,
    };
  };
  const P = ['Pending'];
  const I = ['Pending', 'In Progress'];
  const R = ['Pending', 'In Progress', 'Resolved'];
  await Complaint.insertMany([
    mk(9, 'MG Road, near City Mall', 'Not working', 'Light has been off for a week, the whole stretch is dark at night.', true, R, 'MG-114'),
    mk(7, 'MG Road, near City Mall', 'Flickering', 'The next pole keeps flickering after sunset and is distracting drivers.', false, I, 'MG-115'),
    mk(6, 'Lake View Park, Gate 2', 'Exposed wires', 'Wires hanging out of the pole base, children play nearby.', true, I, 'LV-07'),
    mk(5, 'Station Road crossing', 'On during daytime', 'The lamp stays on all day, wasting power.', false, R),
    mk(3, 'Sector 12 Market lane', 'Damaged pole', 'Pole leaning dangerously after a truck hit it.', true, P, 'S12-33'),
    mk(2, 'Lake View Park, Gate 2', 'Not working', 'Second lamp near the gate is also off.', true, P, 'LV-08'),
    mk(1, 'Temple Street', 'Flickering', 'Flickers every few seconds, looks about to fail.', false, P),
  ]);
  console.log('Created 7 sample complaints.');
}

main()
  .then(() => disconnectDb())
  .then(() => {
    console.log('Seed complete.');
    process.exit(0);
  })
  .catch(async (err) => {
    console.error(err.message);
    await disconnectDb().catch(() => {});
    process.exit(1);
  });
