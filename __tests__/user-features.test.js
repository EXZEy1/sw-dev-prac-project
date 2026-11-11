const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { randomBytes, randomUUID } = require('node:crypto');
const mongoose = require('mongoose');
const fs = require('node:fs');
const path = require('node:path');
const newman = require('newman');
const { PNG } = require('pngjs');
const jsQR = require('jsqr');
const { createMongo } = require('../scripts/mongo');
const { connectDB, prepareIndexes } = require('../config/db');
const { IDS, fixtureDates, seedFixtures } = require('../scripts/fixtures');
const Appointment = require('../models/Appointment');
const Questionnaire = require('../models/Questionnaire');
const app = require('../server');

const password = randomBytes(16).toString('hex');
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = randomBytes(32).toString('hex');
process.env.JWT_EXPIRE = '1h';
let mongo, server, origin, userToken, otherUserToken, adminToken;

async function request(method, url, body, token) {
  const response = await fetch(`${origin}/api/v1${url}`, {
    method,
    headers: { ...(body !== undefined && { 'Content-Type': 'application/json' }), ...(token && { Authorization: `Bearer ${token}` }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

async function registerUser() {
  const input = { name: 'Booking User', tel: '0812345678', email: `${randomUUID()}@example.test`, password };
  const result = await request('POST', '/auth/register', input);
  assert.equal(result.status, 201);
  return result.body;
}

before(async () => {
  mongo = await createMongo();
  await connectDB(mongo.getUri('dentist_booking_user_test'));
  assert.equal(mongoose.connection.name, 'dentist_booking_user_test');
  await prepareIndexes();
  await seedFixtures(password);
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  origin = `http://127.0.0.1:${server.address().port}`;
  const login = async (email) => {
    const result = await request('POST', '/auth/login', { email, password });
    assert.equal(result.status, 200);
    return result.body.token;
  };
  userToken = await login('extra-owner@example.test');
  otherUserToken = await login('waiter-a@example.test');
  adminToken = await login('admin@example.test');
});

after(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

test('dentist endpoints require login and return only the public dentist information', async () => {
  assert.equal((await request('GET', '/dentists')).status, 401);
  assert.equal((await request('GET', `/dentists/${IDS.dentist}`)).status, 401);
  const list = await request('GET', '/dentists', undefined, userToken);
  assert.equal(list.status, 200);
  assert.equal(list.body.count, 3);
  assert.equal(list.body.data.length, 3);
  assert.deepEqual(Object.keys(list.body.data[0]).sort(), ['_id', 'expertise', 'name', 'yearsOfExperience']);
  const detail = await request('GET', `/dentists/${IDS.dentist}`, undefined, userToken);
  assert.equal(detail.status, 200);
  assert.deepEqual(detail.body.data, list.body.data.find((dentist) => dentist._id === IDS.dentist));
});

test('dentist detail distinguishes malformed IDs from unavailable dentists', async () => {
  assert.equal((await request('GET', '/dentists/not-an-id', undefined, userToken)).status, 400);
  assert.equal((await request('GET', '/dentists/ffffffffffffffffffffffff', undefined, userToken)).status, 404);
});

test('a user creates one booking and lists only their own booking despite query filters', async () => {
  const user = await registerUser();
  const empty = await request('GET', '/appointments', undefined, user.token);
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.body.data, []);
  const selection = { dentist: IDS.dentist, bookingDate: fixtureDates().bookingDate };
  const created = await request('POST', '/appointments', selection, user.token);
  assert.equal(created.status, 201);
  assert.equal(created.body.data.user._id, user._id);
  assert.equal(created.body.data.dentist._id, selection.dentist);
  assert.equal(created.body.data.bookingDate, selection.bookingDate);
  assert.equal(created.body.data.bookingReference, created.body.data._id);
  assert.equal(created.body.data.user.email, undefined);
  const own = await request('GET', `/appointments?user=${IDS.extraOwner}&status=cancelled`, undefined, user.token);
  assert.equal(own.body.count, 1);
  assert.equal(own.body.data[0]._id, created.body.data._id);
  const duplicate = await request('POST', '/appointments', { ...selection, dentist: IDS.secondDentist }, user.token);
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.body.code, 'BOOKING_LIMIT_REACHED');
});

test('simultaneous booking requests enforce the one-booking quota through the HTTP API', async () => {
  const user = await registerUser();
  const selection = { dentist: IDS.dentist, bookingDate: fixtureDates().bookingDate };
  const results = await Promise.all([
    request('POST', '/appointments', selection, user.token),
    request('POST', '/appointments', selection, user.token),
  ]);
  assert.deepEqual(results.map((result) => result.status).sort(), [201, 409]);
  assert.equal(results.find((result) => result.status === 409).body.code, 'BOOKING_LIMIT_REACHED');
  assert.equal((await request('GET', '/appointments', undefined, user.token)).body.count, 1);
});

test('booking creation validates the selection, rejects owner/status injection and requires a user role', async () => {
  const user = await registerUser();
  const valid = { dentist: IDS.dentist, bookingDate: fixtureDates().bookingDate };
  const invalidBodies = [
    {}, [], { ...valid, dentist: { $ne: null } }, { ...valid, bookingDate: '2026-02-30' },
    { ...valid, bookingDate: '2000-01-01' }, { ...valid, user: IDS.extraOwner }, { ...valid, status: 'cancelled' },
  ];
  for (const body of invalidBodies) {
    assert.equal((await request('POST', '/appointments', body, user.token)).status, 400);
  }
  assert.equal((await request('POST', '/appointments', { ...valid, dentist: 'ffffffffffffffffffffffff' }, user.token)).status, 404);
  assert.equal((await request('POST', '/appointments', valid)).status, 401);
  assert.equal((await request('POST', '/appointments', valid, adminToken)).status, 403);
  assert.equal((await request('GET', '/appointments', undefined, adminToken)).status, 403);
  assert.equal((await request('GET', '/appointments', undefined, user.token)).body.count, 0);
});

test('an owner views, edits and cancels a booking, then can book again', async () => {
  const user = await registerUser();
  const selection = { dentist: IDS.dentist, bookingDate: fixtureDates().bookingDate };
  const created = await request('POST', '/appointments', selection, user.token);
  const id = created.body.data._id;
  const detail = await request('GET', `/appointments/${id}`, undefined, user.token);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.data._id, id);
  const changes = { dentist: IDS.secondDentist, bookingDate: fixtureDates().changedBookingDate };
  const edited = await request('PATCH', `/appointments/${id}`, changes, user.token);
  assert.equal(edited.status, 200);
  assert.equal(edited.body.data.dentist._id, changes.dentist);
  assert.equal(edited.body.data.bookingDate, changes.bookingDate);
  assert.equal(edited.body.data.user._id, user._id);
  for (const body of [{}, { user: IDS.extraOwner }, { status: 'cancelled' }, { bookingDate: '2000-01-01' }]) {
    assert.equal((await request('PATCH', `/appointments/${id}`, body, user.token)).status, 400);
  }
  const cancelled = await request('DELETE', `/appointments/${id}`, undefined, user.token);
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.body.data.appointmentId, id);
  assert.equal(cancelled.body.data.dentistId, changes.dentist);
  assert.equal(cancelled.body.data.bookingDate, changes.bookingDate);
  assert.ok(Number.isFinite(Date.parse(cancelled.body.data.cancelledAt)));
  const repeated = await request('DELETE', `/appointments/${id}`, undefined, user.token);
  assert.deepEqual(repeated.body.data, cancelled.body.data);
  const saved = await Appointment.findById(id);
  assert.equal(saved.status, 'cancelled');
  assert.equal(saved.cancelledAt.toISOString(), cancelled.body.data.cancelledAt);
  assert.equal((await request('GET', '/appointments', undefined, user.token)).body.count, 0);
  assert.equal((await request('GET', `/appointments/${id}`, undefined, user.token)).status, 404);
  assert.equal((await request('PATCH', `/appointments/${id}`, changes, user.token)).status, 409);
  assert.equal((await request('POST', '/appointments', selection, user.token)).status, 201);
});

test('another user cannot read, edit or cancel a booking and cannot change its owner', async () => {
  const path = `/appointments/${IDS.extraAppointment}`;
  for (const [method, body] of [['GET', undefined], ['PATCH', { dentist: IDS.secondDentist }], ['DELETE', undefined]]) {
    const result = await request(method, path, body, otherUserToken);
    assert.equal(result.status, 404);
    assert.equal(result.body.code, 'NOT_FOUND');
  }
  const unchanged = await request('GET', path, undefined, userToken);
  assert.equal(unchanged.body.data.user._id, IDS.extraOwner);
  assert.equal(unchanged.body.data.dentist._id, IDS.dentist);
  assert.equal(unchanged.body.data.status, 'booked');
  assert.equal((await request('GET', path, undefined, adminToken)).status, 403);
});

test('own booking endpoints validate IDs and require login before accessing a booking', async () => {
  for (const [method, body] of [['GET', undefined], ['PATCH', { dentist: IDS.secondDentist }], ['DELETE', undefined]]) {
    assert.equal((await request(method, `/appointments/${IDS.extraAppointment}`, body)).status, 401);
    assert.equal((await request(method, '/appointments/not-an-id', body, userToken)).status, 400);
    assert.equal((await request(method, '/appointments/ffffffffffffffffffffffff', body, userToken)).status, 404);
  }
});

test('questionnaire responses belong to one booking, support replacement and allow owner/admin reads only', async () => {
  const path = `/appointments/${IDS.extraAppointment}/questionnaire`;
  const empty = await request('GET', path, undefined, userToken);
  assert.equal(empty.status, 200);
  assert.equal(empty.body.data, null);
  const answers = { reasonForVisit: ' Tooth pain ', allergyInfo: 'Penicillin', notes: 'Prefer morning' };
  const created = await request('PUT', path, answers, userToken);
  assert.equal(created.status, 201);
  assert.equal(created.body.data.appointment, IDS.extraAppointment);
  assert.equal(created.body.data.reasonForVisit, answers.reasonForVisit.trim());
  const ownerRead = await request('GET', path, undefined, userToken);
  const adminRead = await request('GET', path, undefined, adminToken);
  assert.equal(ownerRead.status, 200);
  assert.deepEqual(adminRead.body, ownerRead.body);
  assert.equal((await request('GET', path, undefined, otherUserToken)).status, 404);
  assert.equal((await request('PUT', path, answers, otherUserToken)).status, 404);
  assert.equal((await request('PUT', path, answers, adminToken)).status, 403);
  assert.equal((await request('GET', path)).status, 401);
  assert.equal((await request('PUT', path, answers)).status, 401);
  const replaced = await request('PUT', path, { reasonForVisit: 'Routine checkup' }, userToken);
  assert.equal(replaced.status, 200);
  assert.equal(replaced.body.data._id, created.body.data._id);
  assert.equal(replaced.body.data.allergyInfo, '');
  assert.equal(replaced.body.data.notes, '');
  assert.equal(await Questionnaire.countDocuments({ appointment: IDS.extraAppointment }), 1);
  const detail = await request('GET', `/appointments/${IDS.extraAppointment}`, undefined, userToken);
  assert.equal(detail.body.data.questionnaire, undefined);
  const list = await request('GET', '/appointments', undefined, userToken);
  assert.equal(list.body.data[0].questionnaire, undefined);
});

test('questionnaire input rejects invalid text, excessive lengths and appointment reassignment', async () => {
  const path = `/appointments/${IDS.extraAppointment}/questionnaire`;
  for (const body of [
    {}, { reasonForVisit: ' ' }, { reasonForVisit: 123 }, { reasonForVisit: { $ne: null } },
    { reasonForVisit: 'x'.repeat(501) }, { reasonForVisit: 'Checkup', allergyInfo: 'x'.repeat(1001) },
    { reasonForVisit: 'Checkup', notes: null }, { reasonForVisit: 'Checkup', notes: 'x'.repeat(1001) },
    { reasonForVisit: 'Checkup', appointment: IDS.queueAppointment },
  ]) {
    assert.equal((await request('PUT', path, body, userToken)).status, 400);
  }
  assert.equal((await request('GET', '/appointments/not-an-id/questionnaire', undefined, adminToken)).status, 400);
  assert.equal((await request('GET', '/appointments/ffffffffffffffffffffffff/questionnaire', undefined, adminToken)).status, 404);
  const unchanged = await request('GET', path, undefined, userToken);
  assert.equal(unchanged.body.data.reasonForVisit, 'Routine checkup');
});

test('a cancelled booking hides its questionnaire and rejects further responses', async () => {
  const user = await registerUser();
  const created = await request('POST', '/appointments', { dentist: IDS.dentist, bookingDate: fixtureDates().bookingDate }, user.token);
  const id = created.body.data._id;
  const path = `/appointments/${id}/questionnaire`;
  assert.equal((await request('PUT', path, { reasonForVisit: 'Checkup' }, user.token)).status, 201);
  assert.equal((await request('DELETE', `/appointments/${id}`, undefined, user.token)).status, 200);
  assert.equal((await request('GET', path, undefined, user.token)).status, 404);
  assert.equal((await request('GET', path, undefined, adminToken)).status, 404);
  assert.equal((await request('PUT', path, { reasonForVisit: 'Updated' }, user.token)).status, 404);
  assert.equal(await Questionnaire.countDocuments({ appointment: id }), 1);
});

function decodeQr(dataUrl) {
  assert.match(dataUrl, /^data:image\/png;base64,/);
  const png = PNG.sync.read(Buffer.from(dataUrl.split(',')[1], 'base64'));
  const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  assert.ok(decoded, 'The returned PNG must contain a readable QR code.');
  return decoded.data;
}

test('booking detail generates a readable QR containing only the stable booking reference', async () => {
  const path = `/appointments/${IDS.extraAppointment}`;
  const first = await request('GET', path, undefined, userToken);
  const second = await request('GET', path, undefined, userToken);
  assert.equal(first.status, 200);
  const payload = decodeQr(first.body.data.qrCodeDataUrl);
  assert.equal(payload, `DENTIST-BOOKING:${IDS.extraAppointment}`);
  assert.equal(decodeQr(second.body.data.qrCodeDataUrl), payload);
  const edited = await request('PATCH', path, { dentist: IDS.secondDentist }, userToken);
  assert.equal(edited.status, 200);
  assert.equal(edited.body.data.qrCodeDataUrl, undefined);
  const afterEdit = await request('GET', path, undefined, userToken);
  assert.equal(decodeQr(afterEdit.body.data.qrCodeDataUrl), payload);
  assert.equal((await request('GET', '/appointments', undefined, userToken)).body.data[0].qrCodeDataUrl, undefined);
  assert.equal((await request('GET', path, undefined, otherUserToken)).status, 404);
  assert.equal((await request('GET', path, undefined, adminToken)).status, 403);
});

test('different bookings produce different QR references and cancelled bookings cannot produce a QR', async () => {
  const user = await registerUser();
  const created = await request('POST', '/appointments', { dentist: IDS.dentist, bookingDate: fixtureDates().bookingDate }, user.token);
  const id = created.body.data._id;
  const detail = await request('GET', `/appointments/${id}`, undefined, user.token);
  assert.equal(decodeQr(detail.body.data.qrCodeDataUrl), `DENTIST-BOOKING:${id}`);
  assert.notEqual(id, IDS.extraAppointment);
  assert.equal((await request('DELETE', `/appointments/${id}`, undefined, user.token)).status, 200);
  const cancelled = await request('GET', `/appointments/${id}`, undefined, user.token);
  assert.equal(cancelled.status, 404);
  assert.equal(cancelled.body.data, undefined);
});

async function runCollection(name) {
  const collection = JSON.parse(fs.readFileSync(path.resolve(__dirname, `../postman/${name}.collection.json`), 'utf8'));
  const variables = { baseUrl: `${origin}/api/v1`, demoPassword: password };
  return new Promise((resolve, reject) => {
    newman.run({ collection, envVar: Object.entries(variables).map(([key, value]) => ({ key, value })), reporters: [], timeoutRequest: 5000 },
      (error, summary) => error ? reject(error) : resolve(summary));
  });
}

test('the user core Newman collection passes twice with fresh users and runtime booking IDs', async () => {
  for (let run = 0; run < 2; run++) {
    const summary = await runCollection('user-core');
    assert.deepEqual(summary.run.failures.map((failure) => ({ name: failure.source.name, message: failure.error.message })), []);
    assert.equal(summary.run.stats.requests.total, 17);
  }
});
