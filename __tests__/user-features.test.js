const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { randomBytes, randomUUID } = require('node:crypto');
const mongoose = require('mongoose');
const { createMongo } = require('../scripts/mongo');
const { connectDB, prepareIndexes } = require('../config/db');
const { IDS, fixtureDates, seedFixtures } = require('../scripts/fixtures');
const Appointment = require('../models/Appointment');
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
