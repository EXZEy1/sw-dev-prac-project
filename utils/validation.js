const { appError } = require('./errors');

function invalid(message, fields) {
  return appError(400, 'VALIDATION_ERROR', message, fields);
}

function assertObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid('Request body must be an object.');
}

function allowFields(value, allowed) {
  assertObject(value);
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw invalid(`Allowed fields: ${allowed.join(', ')}.`);
}

function assertId(value, label = 'ID') {
  if (typeof value !== 'string' || !/^[a-f\d]{24}$/i.test(value)) {
    throw appError(400, 'INVALID_ID', `${label} must be a 24-character ObjectId.`);
  }
  return value.toLowerCase();
}

function isCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function bangkokDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const get = (type) => parts.find((part) => part.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function addDays(value, days) {
  const date = new Date(`${value}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function assertBookingDate(value, allowPastDate = false) {
  if (!isCalendarDate(value)) throw invalid('bookingDate must be a real date in YYYY-MM-DD format.');
  if (!allowPastDate && value < bangkokDate()) throw invalid('bookingDate cannot be before today in Thailand.');
  return value;
}

module.exports = { invalid, assertObject, allowFields, assertId, isCalendarDate, bangkokDate, addDays, assertBookingDate };
