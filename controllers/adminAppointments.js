const Appointment = require('../models/Appointment');
const { getAppointment, updateAppointment, cancelAppointment } = require('../utils/booking');
const { invalid } = require('../utils/validation');
const { readQuery, readDentistDate } = require('../utils/filters');

const STATUSES = ['booked', 'cancelled'];

async function getAllAppointments(req, res) {
  const query = readQuery(req.query, ['dentist', 'bookingDate', 'status']);
  const status = query.status === undefined ? 'booked' : query.status;
  if (!STATUSES.includes(status)) throw invalid('status must be booked or cancelled.');
  const filter = { ...readDentistDate(query), status };
  const appointments = await Appointment.find(filter).sort({ bookingDate: 1, createdAt: 1, _id: 1 }).select('_id');
  const records = await Promise.all(appointments.map((appointment) => getAppointment(appointment.id, { includeCancelled: true })));
  const data = records.filter((appointment) => appointment.status === status);
  return res.json({ success: true, count: data.length, data });
}

async function getAnyAppointment(req, res) {
  const data = await getAppointment(req.params.id, { includeCancelled: true });
  return res.json({ success: true, data });
}

async function updateAnyAppointment(req, res) {
  const data = await updateAppointment(req.params.id, req.body);
  return res.json({ success: true, data });
}

async function cancelAnyAppointment(req, res) {
  const data = await cancelAppointment(req.params.id);
  return res.json({ success: true, data });
}

module.exports = { getAllAppointments, getAnyAppointment, updateAnyAppointment, cancelAnyAppointment };
