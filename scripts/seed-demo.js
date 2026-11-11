const mongoose = require('mongoose');
const { loadEnv, validateEnv } = require('../config/env');
const { connectDB, prepareIndexes } = require('../config/db');
const { seedFixtures, validateDemoPassword } = require('./fixtures');

function assertDemoDatabase(connection) {
  if (process.env.NODE_ENV === 'production' || connection.name !== 'dentist_booking_demo' || !['127.0.0.1', 'localhost', '::1'].includes(connection.host)) {
    throw new Error('Refusing reset: only the local dentist_booking_demo database is allowed.');
  }
}

async function main() {
  loadEnv();
  validateEnv();
  validateDemoPassword(process.env.DEMO_PASSWORD);
  const connection = await connectDB();
  assertDemoDatabase(connection);
  await prepareIndexes();
  // Clear only this application's collections after checking the connected database.
  for (const name of ['users', 'dentists', 'appointments', 'queueentries', 'waitlistentries', 'questionnaires']) {
    await connection.db.collection(name).deleteMany({});
  }
  await seedFixtures(process.env.DEMO_PASSWORD);
  console.log('Demo data ready: 6 accounts, 3 dentists, 3 booked appointments and 1 cancellation.');
  console.log('Passwords are read from local configuration and were not printed.');
}

if (require.main === module) main().catch((error) => {
  console.error(error.message.startsWith('Refusing reset:') ? error.message : 'Seed failed. Check local configuration, database and fixture constraints.');
  process.exitCode = 1;
}).finally(() => mongoose.disconnect());

module.exports = { assertDemoDatabase };
