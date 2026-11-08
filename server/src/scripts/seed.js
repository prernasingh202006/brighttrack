// Seeds one admin, one demo resident and sample complaints.  Usage: npm run seed
// The admin password comes from SEED_ADMIN_PASSWORD and is REQUIRED in production.
const env = require('../config/env');
const { connectDb, disconnectDb } = require('../config/db');
const User = require('../models/User');
const Complaint = require('../models/Complaint');
const Technician = require('../models/Technician');
const { generateComplaintId } = require('../utils/helpers');

const DAY = 24 * 60 * 60 * 1000;

async function upsertUser({ name, email, password, role }) {
  let user = await User.findOne({ email });
  if (user) {
    console.log(`  exists: ${email} (${user.role})`);
    return user;
  }
  // Seeded accounts are trusted, so they skip email verification.
  user = await User.create({ name, email, role, emailVerified: true, passwordHash: await User.hashPassword(password) });
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

  console.log('Seeding technicians...');
  const techs = {};
  for (const t of [
    { name: 'Ramesh Patil', area: 'Bandra / Khar' },
    { name: 'Sunita Sharma', area: 'Powai / Andheri East' },
    { name: 'Imran Sheikh', area: 'Dadar / Mahim' },
    { name: 'Prakash Nair', area: 'Juhu / Vile Parle' },
    { name: 'Anita Desai', area: 'Borivali / Kandivali' },
  ]) {
    // eslint-disable-next-line no-await-in-loop
    techs[t.name] = (await Technician.findOne({ name: t.name })) || (await Technician.create(t));
  }
  console.log(`  ${Object.keys(techs).length} technicians ready`);

  if ((await Complaint.countDocuments()) > 0) {
    console.log('Complaints already exist, skipping samples.');
    return;
  }
  const now = Date.now();
  // Sample places are approximate Mumbai locations. Real reports get their place from the address search.
  const BANDRA = { label: 'Linking Road, Bandra West, Mumbai', lat: 19.0654, lng: 72.8353 };
  const POWAI = { label: 'Powai Lake Garden, Powai, Mumbai', lat: 19.1263, lng: 72.9066 };
  const DADAR = { label: 'Station Road, Dadar West, Mumbai', lat: 19.0186, lng: 72.8424 };
  const JUHU = { label: 'Juhu Tara Road, Juhu, Mumbai', lat: 19.0988, lng: 72.8265 };
  const HIRANANDANI = { label: 'Hiranandani Gardens, Powai, Mumbai', lat: 19.119, lng: 72.91 };
  const R = ['Pending', 'In Progress', 'Resolved'];
  const I = ['Pending', 'In Progress'];
  const P = ['Pending'];

  const mk = (daysAgo, place, type, description, unsafe, statuses, pole, tech, fix) => {
    const last = statuses[statuses.length - 1];
    const history = statuses.map((status, i) => ({
      status,
      changedBy: i === 0 ? resident._id : admin._id,
      at: new Date(now - (daysAgo - i * 0.8) * DAY),
      note: i === 1 ? `Assigned to ${tech.name}` : i === 2 ? fix : undefined,
    }));
    return {
      complaintId: generateComplaintId(), user: resident._id, location: place.label, coords: { lat: place.lat, lng: place.lng },
      pole, type, description, unsafe, status: last, history, createdAt: history[0].at, updatedAt: history[history.length - 1].at,
      technician: tech && tech._id, assignedTo: tech && tech.name, assignedAt: tech ? history[1].at : undefined,
      resolutionNote: last === 'Resolved' ? fix : undefined,
      resolvedAt: last === 'Resolved' ? history[history.length - 1].at : undefined,
    };
  };
  // create() (not insertMany) so the pre-validate hook sets each complaint's locationKey
  for (const c of [
    mk(9, BANDRA, 'Not working', 'Light has been off for a week, the whole stretch is dark at night.', true, R, 'LR-114', techs['Ramesh Patil'], 'Replaced the failed lamp and driver. Tested after sunset, working normally.'),
    mk(7, BANDRA, 'Flickering', 'The next pole keeps flickering after sunset and is distracting drivers.', false, I, 'LR-115', techs['Ramesh Patil']),
    mk(6, POWAI, 'Exposed wires', 'Wires hanging out of the pole base, children play nearby.', true, I, 'PW-07', techs['Sunita Sharma']),
    mk(5, DADAR, 'On during daytime', 'The lamp stays on all day, wasting power.', false, R, undefined, techs['Imran Sheikh'], 'Faulty photocell replaced. Lamp now switches on at dusk and off at dawn.'),
    mk(3, HIRANANDANI, 'Damaged pole', 'Pole leaning dangerously after a truck hit it.', true, P, 'HG-33'),
    mk(2, POWAI, 'Not working', 'Second lamp near the gate is also off.', true, P, 'PW-08'),
    mk(1, JUHU, 'Flickering', 'Flickers every few seconds, looks about to fail.', false, P),
  ]) {
    // eslint-disable-next-line no-await-in-loop
    await Complaint.create(c);
  }
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
