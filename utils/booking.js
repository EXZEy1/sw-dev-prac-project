const Appointment = require('../models/Appointment');
const Dentist = require('../models/Dentist');
const { appError } = require('./errors');
const { allowFields, assertId, assertBookingDate, invalid } = require('./validation');

const populate = [
  { path: 'user', select: 'name tel' },
  { path: 'dentist', select: 'name yearsOfExperience expertise' },
];

function toAppointmentData(doc) {
  if (!doc.user || !doc.dentist) throw appError(409, 'INVALID_APPOINTMENT_REFERENCE', 'Appointment references unavailable data.');
  return {
    _id: doc.id, bookingReference: doc.id,
    user: { _id: doc.user.id, name: doc.user.name, tel: doc.user.tel },
    dentist: { _id: doc.dentist.id, name: doc.dentist.name, yearsOfExperience: doc.dentist.yearsOfExperience, expertise: doc.dentist.expertise },
    bookingDate: doc.bookingDate, status: doc.status,
    cancelledAt: doc.cancelledAt ? doc.cancelledAt.toISOString() : null,
    createdAt: doc.createdAt.toISOString(), updatedAt: doc.updatedAt.toISOString(),
  };
}

async function validateBookingSelection(selection, { allowPastDate = false } = {}) {
  allowFields(selection, ['dentist', 'bookingDate']);
  const dentist = assertId(selection.dentist, 'dentist');
  const bookingDate = assertBookingDate(selection.bookingDate, allowPastDate);
  if (!await Dentist.exists({ _id: dentist })) throw appError(404, 'NOT_FOUND', 'Dentist not found.');
  return { dentist, bookingDate };
}

async function getAppointment(appointmentId, { includeCancelled = false } = {}) {
  const filter = { _id: assertId(appointmentId, 'appointmentId') };
  if (!includeCancelled) filter.status = 'booked';
  const doc = await Appointment.findOne(filter).populate(populate);
  if (!doc) throw appError(404, 'NOT_FOUND', 'Appointment not found.');
  return toAppointmentData(doc);
}

async function updateAppointment(appointmentId, changes) {
  const id = assertId(appointmentId, 'appointmentId');
  allowFields(changes, ['dentist', 'bookingDate']);
  if (Object.keys(changes).length === 0) throw invalid('Provide dentist or bookingDate.');
  const current = await Appointment.findById(id);
  if (!current) throw appError(404, 'NOT_FOUND', 'Appointment not found.');
  if (current.status === 'cancelled') throw appError(409, 'APPOINTMENT_CANCELLED', 'Cannot edit a cancelled appointment.');
  const selection = await validateBookingSelection({
    dentist: Object.hasOwn(changes, 'dentist') ? changes.dentist : current.dentist.toString(),
    bookingDate: Object.hasOwn(changes, 'bookingDate') ? changes.bookingDate : current.bookingDate,
  }, { allowPastDate: !Object.hasOwn(changes, 'bookingDate') });
  const updates = {};
  for (const key of Object.keys(changes)) updates[key] = selection[key];
  const doc = await Appointment.findOneAndUpdate({ _id: id, status: 'booked' }, { $set: updates }, {
    returnDocument: 'after', runValidators: true,
  }).populate(populate);
  if (!doc) throw appError(409, 'APPOINTMENT_CANCELLED', 'Appointment was cancelled while editing.');
  return toAppointmentData(doc);
}

async function cancelAppointment(appointmentId) {
  const id = assertId(appointmentId, 'appointmentId');
  const cancelled = await Appointment.findOneAndUpdate({ _id: id, status: 'booked' }, {
    $set: { status: 'cancelled', cancelledAt: new Date() },
  }, { returnDocument: 'after', runValidators: true });
  const doc = cancelled || await Appointment.findById(id);
  if (!doc) throw appError(404, 'NOT_FOUND', 'Appointment not found.');
  return { appointmentId: doc.id, dentistId: doc.dentist.toString(), bookingDate: doc.bookingDate, cancelledAt: doc.cancelledAt.toISOString() };
}

module.exports = { validateBookingSelection, getAppointment, updateAppointment, cancelAppointment };
