const { appError } = require('./errors');
const { invalid, assertId, assertBookingDate } = require('./validation');

function readQuery(query, allowed) {
  const keys = Object.keys(query || {});
  if (keys.some((key) => !allowed.includes(key))) throw invalid(`Allowed query parameters: ${allowed.join(', ')}.`);
  return query || {};
}

function readDentistDate(query, { required = false } = {}) {
  const filter = {};
  if (required && (query.dentist === undefined || query.bookingDate === undefined)) {
    throw appError(400, 'VALIDATION_ERROR', 'Provide both dentist and bookingDate.');
  }
  if (query.dentist !== undefined) filter.dentist = assertId(query.dentist, 'dentist');
  if (query.bookingDate !== undefined) filter.bookingDate = assertBookingDate(query.bookingDate, true);
  return filter;
}

module.exports = { readQuery, readDentistDate };
