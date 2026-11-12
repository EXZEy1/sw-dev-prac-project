const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { once } = require('node:events');
const { randomBytes } = require('node:crypto');
const mongoose = require('mongoose');
const newman = require('newman');
const { PNG } = require('pngjs');
const jsQR = require('jsqr');
const { createMongo } = require('../scripts/mongo');
const { connectDB, prepareIndexes } = require('../config/db');
const { IDS, seedFixtures } = require('../scripts/fixtures');
const { buildCollection, CORE_FOLDERS, EXTRA_FOLDERS } = require('../scripts/build-collection');
const User = require('../models/User');
const Dentist = require('../models/Dentist');
const Appointment = require('../models/Appointment');
const Questionnaire = require('../models/Questionnaire');
const QueueEntry = require('../models/QueueEntry');
const WaitlistEntry = require('../models/WaitlistEntry');
const app = require('../server');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = randomBytes(32).toString('hex');
process.env.JWT_EXPIRE = '1h';
const password = randomBytes(16).toString('hex');
let mongo, server, origin;

before(async () => {
  mongo = await createMongo();
  await connectDB(mongo.getUri('dentist_booking_integration_test'));
  assert.equal(mongoose.connection.name, 'dentist_booking_integration_test');
  await prepareIndexes();
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  origin = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(async () => {
  // Never reset the Atlas/demo connection when exercising the complete presentation.
  assert.equal(mongoose.connection.name, 'dentist_booking_integration_test');
  for (const model of [User, Dentist, Appointment, Questionnaire, QueueEntry, WaitlistEntry]) await model.deleteMany({});
  await seedFixtures(password);
});

after(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

async function runPresentation(folder) {
  const collection = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../postman/dentist-booking.collection.json'), 'utf8'));
  assert.deepEqual(collection, buildCollection(), 'Rebuild the combined collection after changing a source collection.');
  const environment = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../postman/localhost.environment.example.json'), 'utf8'));
  const variables = { serverUrl: origin, baseUrl: `${origin}/api/v1`, demoPassword: password };
  const summary = await new Promise((resolve, reject) => {
    newman.run({ collection, environment, ...(folder && { folder }),
      envVar: Object.entries(variables).map(([key, value]) => ({ key, value })),
      reporters: [], bail: true, timeoutRequest: 5000,
    }, (error, result) => error ? reject(error) : resolve(result));
  });
  assert.deepEqual(summary.run.failures.map(failure => ({ request: failure.source.name, message: failure.error.message })), []);
  return summary;
}

function assertCurrentQr(summary) {
  const dataUrl = summary.environment.get('bookingQrDataUrl');
  assert.match(dataUrl, /^data:image\/png;base64,/);
  const png = PNG.sync.read(Buffer.from(dataUrl.split(',')[1], 'base64'));
  const qr = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  assert.ok(qr);
  assert.equal(qr.data, `DENTIST-BOOKING:${IDS.extraAppointment}`);
}

test('the combined presentation passes all A+B requirements from a clean seed', async () => {
  const summary = await runPresentation();
  assert.equal(summary.run.stats.requests.total, 88);
  assert.equal(summary.run.stats.assertions.total, 175);
  assertCurrentQr(summary);
  assert.equal((await Appointment.findById(IDS.extraAppointment)).status, 'cancelled');
  assert.equal(await Questionnaire.countDocuments({ appointment: IDS.extraAppointment }), 1);
  assert.equal(await QueueEntry.countDocuments(), 2);
  assert.equal(await WaitlistEntry.countDocuments(), 2);
});

test('core and extras run separately with a slide break and fresh client environments', async () => {
  const core = await runPresentation(CORE_FOLDERS);
  assert.equal(core.run.stats.requests.total, 46);
  assert.equal(core.run.stats.assertions.total, 97);
  assert.equal((await Appointment.findById(IDS.adminAppointment)).status, 'cancelled');
  assert.equal((await Appointment.findById(IDS.extraAppointment)).status, 'booked');
  const extras = await runPresentation(EXTRA_FOLDERS);
  assert.equal(extras.run.stats.requests.total, 42);
  assert.equal(extras.run.stats.assertions.total, 78);
  assertCurrentQr(extras);
});
