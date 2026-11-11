const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { randomBytes } = require('node:crypto');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const newman = require('newman');
const { createMongo } = require('../scripts/mongo');
const { connectDB, prepareIndexes } = require('../config/db');
const { IDS, fixtureDates, seedFixtures } = require('../scripts/fixtures');
const { assertDemoDatabase } = require('../scripts/seed-demo');
const { bangkokDate, addDays, isCalendarDate } = require('../utils/validation');
const booking = require('../utils/booking');
const User = require('../models/User');
const Dentist = require('../models/Dentist');
const Appointment = require('../models/Appointment');
const app = require('../server');

const password = randomBytes(16).toString('hex');
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = randomBytes(32).toString('hex');
process.env.JWT_EXPIRE = '1h';
let mongo, server, origin, adminToken, userToken;

async function request(method, url, body, token) {
  const response = await fetch(`${origin}${url}`, {
    method,
    headers: { ...(body !== undefined && { 'Content-Type': 'application/json' }), ...(token && { Authorization: `Bearer ${token}` }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, headers: response.headers, body: await response.json() };
}

before(async () => {
  mongo = await createMongo();
  await connectDB(mongo.getUri('dentist_booking_p0_test'));
  assert.equal(mongoose.connection.name, 'dentist_booking_p0_test');
  await prepareIndexes();
  await seedFixtures(password);
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  origin = `http://127.0.0.1:${server.address().port}`;
  const admin = await request('POST', '/api/v1/auth/login', { email: 'admin@example.test', password });
  const user = await request('POST', '/api/v1/auth/login', { email: 'extra-owner@example.test', password });
  assert.equal(admin.status, 200); assert.equal(user.status, 200);
  adminToken = admin.body.token; userToken = user.body.token;
});

after(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

test('Bangkok calendar dates handle the UTC day boundary and invalid dates', () => {
  assert.equal(bangkokDate(new Date('2026-11-11T16:59:59Z')), '2026-11-11');
  assert.equal(bangkokDate(new Date('2026-11-11T17:00:00Z')), '2026-11-12');
  assert.equal(isCalendarDate('2028-02-29'), true);
  for (const input of ['2026-02-29', '2026-04-31', '2026-1-01', {}, null]) assert.equal(isCalendarDate(input), false);
});

test('fixtures have separate owners and the promised records/indexes', async () => {
  assert.equal(await User.countDocuments(), 6);
  assert.equal(await Dentist.countDocuments(), 3);
  assert.equal(await Appointment.countDocuments({ status: 'booked' }), 3);
  assert.equal(await Appointment.countDocuments({ status: 'cancelled' }), 1);
  const doc = await User.findById(IDS.admin).select('+password');
  assert.notEqual(doc.password, password);
  assert.equal(await doc.matchPassword(password), true);
  const indexes = await Appointment.collection.indexes();
  assert.ok(indexes.some((index) => index.unique && index.partialFilterExpression?.status === 'booked'));
});

test('health reports DB readiness; auth returns public fields in the agreed legacy shape', async () => {
  assert.equal((await request('GET', '/health')).body.database, 'ready');
  const result = await request('GET', '/api/v1/auth/me', undefined, adminToken);
  assert.equal(result.status, 200);
  assert.equal(result.body.data.role, 'admin');
  assert.equal(result.body.data.tel, '0800000003');
  assert.equal(result.body.data.password, undefined);
  assert.equal(result.body.data.token, undefined);
  assert.equal(result.headers.get('cache-control'), 'no-store');
});

test('anonymous/expired/forged tokens fail and authorization uses role from DB', async () => {
  assert.equal((await request('GET', '/api/v1/auth/me')).status, 401);
  const expired = jwt.sign({ id: IDS.admin }, process.env.JWT_SECRET, { expiresIn: -1 });
  assert.equal((await request('GET', '/api/v1/auth/me', undefined, expired)).status, 401);
  const forged = jwt.sign({ id: IDS.admin }, randomBytes(32).toString('hex'));
  assert.equal((await request('GET', '/api/v1/auth/me', undefined, forged)).status, 401);
  const wrongRole = jwt.sign({ id: IDS.extraOwner, role: 'admin' }, process.env.JWT_SECRET);
  assert.equal((await request('GET', '/api/v1/admin/appointments', undefined, wrongRole)).status, 403);
  assert.equal((await request('GET', '/api/v1/queues', undefined, userToken)).status, 403);
  const adminAccess = await request('GET', '/api/v1/admin/appointments', undefined, adminToken);
  // This is a role-guard check. The admin feature collection verifies B's behavior.
  assert.ok([200, 501].includes(adminAccess.status));
  if (adminAccess.status === 501) assert.equal(adminAccess.body.code, 'FEATURE_NOT_IMPLEMENTED');
  else {
    assert.equal(adminAccess.body.success, true);
    assert.ok(Array.isArray(adminAccess.body.data));
  }
});

test('register validates telephone/types, rejects public admin registration and normalizes email', async () => {
  const input = { name: 'New User', tel: '0812345678', email: 'new-user@example.test', password };
  const { tel, ...missingTel } = input;
  assert.equal((await request('POST', '/api/v1/auth/register', missingTel)).status, 400);
  assert.equal((await request('POST', '/api/v1/auth/register', { ...input, role: 'admin' })).status, 400);
  assert.equal((await request('POST', '/api/v1/auth/register', { ...input, email: { $ne: null } })).status, 400);
  assert.equal((await request('POST', '/api/v1/auth/register', { ...input, password: 'ก'.repeat(30) })).status, 400);
  const created = await request('POST', '/api/v1/auth/register', { ...input, email: ' NEW-USER@EXAMPLE.TEST ' });
  assert.equal(created.status, 201);
  assert.equal(created.body.role, 'user');
  assert.equal(created.body.email, input.email);
  assert.equal(typeof created.body.token, 'string');
  assert.equal(created.body.password, undefined);
  const duplicate = await request('POST', '/api/v1/auth/register', input);
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.body.code, 'DUPLICATE_RECORD');
});

test('login rejects bad credentials/operator input and deleted accounts cannot reuse tokens', async () => {
  assert.equal((await request('POST', '/api/v1/auth/login', { email: 'admin@example.test', password: 'incorrect-pass' })).status, 401);
  assert.equal((await request('POST', '/api/v1/auth/login', { email: { $ne: null }, password })).status, 400);
  const disposable = await User.create({ name: 'Disposable', tel: '0800000099', email: 'disposable@example.test', password });
  const token = disposable.getSignedJwtToken();
  await User.deleteOne({ _id: disposable._id });
  assert.equal((await request('GET', '/api/v1/auth/me', undefined, token)).status, 401);
});

test('logout clears the cookie and requests without client token are denied', async () => {
  const logout = await request('GET', '/api/v1/auth/logout', undefined, userToken);
  assert.equal(logout.status, 200);
  assert.equal(logout.body.data, null);
  assert.match(logout.headers.get('set-cookie'), /token=/);
  assert.equal((await request('GET', '/api/v1/auth/me')).status, 401);
  // JWT remains stateless; no test incorrectly claims server-side revocation.
});

test('getAppointment returns plain populated data and cancelled records require an explicit option', async () => {
  const data = await booking.getAppointment(IDS.extraAppointment);
  assert.equal(Object.getPrototypeOf(data), Object.prototype);
  assert.equal(data.user._id, IDS.extraOwner);
  assert.equal(data.dentist._id, IDS.dentist);
  assert.equal(data.bookingReference, IDS.extraAppointment);
  assert.equal(typeof data.createdAt, 'string');
  assert.equal(data.qrCodeDataUrl, undefined);
  assert.equal(data.questionnaire, undefined);
  await assert.rejects(booking.getAppointment('bad-id'), { statusCode: 400, code: 'INVALID_ID' });
  await assert.rejects(booking.getAppointment(IDS.cancelledAppointment), { statusCode: 404 });
  const cancelled = await booking.getAppointment(IDS.cancelledAppointment, { includeCancelled: true });
  assert.equal(cancelled.status, 'cancelled');
});

test('booking selection rejects missing dentists and invalid/past days', async () => {
  const day = fixtureDates().bookingDate;
  assert.deepEqual(await booking.validateBookingSelection({ dentist: IDS.dentist, bookingDate: day }), { dentist: IDS.dentist, bookingDate: day });
  await assert.rejects(booking.validateBookingSelection({ dentist: 'ffffffffffffffffffffffff', bookingDate: day }), { statusCode: 404 });
  await assert.rejects(booking.validateBookingSelection({ dentist: IDS.dentist, bookingDate: '2026-02-30' }), { statusCode: 400 });
  const past = addDays(bangkokDate(), -1);
  await assert.rejects(booking.validateBookingSelection({ dentist: IDS.dentist, bookingDate: past }), { statusCode: 400 });
  assert.equal((await booking.validateBookingSelection({ dentist: IDS.dentist, bookingDate: past }, { allowPastDate: true })).bookingDate, past);
});

test('updateAppointment allowlists changes, preserves owner and allows a dentist-only edit on an old date', async () => {
  const updated = await booking.updateAppointment(IDS.adminAppointment, { dentist: IDS.dentist, bookingDate: fixtureDates().changedBookingDate });
  assert.equal(updated.dentist._id, IDS.dentist);
  assert.equal(updated.user._id, IDS.adminSubject);
  await assert.rejects(booking.updateAppointment(IDS.adminAppointment, { user: IDS.extraOwner }), { statusCode: 400 });
  await assert.rejects(booking.updateAppointment(IDS.adminAppointment, {}), { statusCode: 400 });
  await assert.rejects(booking.updateAppointment(IDS.adminAppointment, { bookingDate: '2026-04-31' }), { statusCode: 400 });
  const past = addDays(bangkokDate(), -1);
  const old = await Appointment.create({ user: IDS.waiterB, dentist: IDS.dentist, bookingDate: past });
  assert.equal((await booking.updateAppointment(old.id, { dentist: IDS.secondDentist })).bookingDate, past);
  await assert.rejects(booking.updateAppointment(old.id, { bookingDate: past }), { statusCode: 400 });
  await booking.cancelAppointment(old.id);
});

test('concurrent cancellations retain one timestamp and hide the record without deleting it', async () => {
  const [a, b] = await Promise.all([booking.cancelAppointment(IDS.adminAppointment), booking.cancelAppointment(IDS.adminAppointment)]);
  assert.deepEqual(a, b);
  assert.equal((await booking.cancelAppointment(IDS.adminAppointment)).cancelledAt, a.cancelledAt);
  assert.equal(await Appointment.countDocuments({ _id: IDS.adminAppointment }), 1);
  await assert.rejects(booking.getAppointment(IDS.adminAppointment), { statusCode: 404 });
  await assert.rejects(booking.updateAppointment(IDS.adminAppointment, { dentist: IDS.secondDentist }), { statusCode: 409, code: 'APPOINTMENT_CANCELLED' });
});

test('the actual MongoDB unique index permits only one simultaneous booking, then permits rebooking after cancellation', async () => {
  const create = () => Appointment.create({ user: IDS.waiterA, dentist: IDS.dentist, bookingDate: fixtureDates().bookingDate });
  const results = await Promise.allSettled([create(), create()]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.find((result) => result.status === 'rejected').reason.code, 11000);
  assert.equal(await Appointment.countDocuments({ user: IDS.waiterA, status: 'booked' }), 1);
  const booked = results.find((result) => result.status === 'fulfilled').value;
  await booking.cancelAppointment(booked.id);
  await create();
  assert.equal(await Appointment.countDocuments({ user: IDS.waiterA, status: 'booked' }), 1);
});

test('the real Newman v2.1 P0 collection passes against the running server', async () => {
  const collection = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../postman/p0.collection.json'), 'utf8'));
  const values = { serverUrl: origin, baseUrl: `${origin}/api/v1`, demoPassword: password, adminEmail: 'admin@example.test', extraUserEmail: 'extra-owner@example.test' };
  const summary = await new Promise((resolve, reject) => {
    newman.run({ collection, envVar: Object.entries(values).map(([key, value]) => ({ key, value })), reporters: [], timeoutRequest: 5000 }, (error, result) => error ? reject(error) : resolve(result));
  });
  assert.deepEqual(summary.run.failures.map((failure) => ({ name: failure.source.name, message: failure.error.message })), []);
  assert.equal(summary.run.stats.requests.total, 9);
});

test('demo reset refuses unrelated/remote/production databases', () => {
  const valid = { name: 'dentist_booking_demo', host: '127.0.0.1' };
  assert.doesNotThrow(() => assertDemoDatabase(valid));
  assert.throws(() => assertDemoDatabase({ ...valid, name: 'assignment7' }), /Refusing reset/);
  assert.throws(() => assertDemoDatabase({ ...valid, host: 'example.com' }), /Refusing reset/);
  process.env.NODE_ENV = 'production';
  try { assert.throws(() => assertDemoDatabase(valid), /Refusing reset/); }
  finally { process.env.NODE_ENV = 'test'; }
});

test('server fails before listening when its database cannot be reached', async () => {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: path.resolve(__dirname, '..'), windowsHide: true,
    env: { ...process.env, MONGO_URI: 'mongodb://127.0.0.1:1/dentist_booking_p0_test', PORT: '50137' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '', stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const timer = setTimeout(() => child.kill(), 10000);
  try {
    const [code] = await once(child, 'close');
    assert.equal(code, 1);
    assert.doesNotMatch(stdout, /Dentist Booking P0:/);
    assert.match(stderr, /server was not opened/);
  } finally { clearTimeout(timer); }
});

test('health reports unavailable after DB disconnect', async () => {
  await mongoose.disconnect();
  assert.equal((await request('GET', '/health')).status, 503);
});
