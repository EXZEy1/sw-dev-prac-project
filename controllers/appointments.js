const Appointment = require('../models/Appointment');
const { validateBookingSelection, getAppointment } = require('../utils/booking');

async function getAppointments(req, res) {
  const appointments = await Appointment.find({ user: req.user.id, status: 'booked' }).select('_id');
  const records = await Promise.all(appointments.map((appointment) => getAppointment(appointment.id, { includeCancelled: true })));
  // A cancellation during this read must not appear as a current booking.
  const data = records.filter((appointment) => appointment.status === 'booked');
  return res.json({ success: true, count: data.length, data });
}

async function createAppointment(req, res) {
  const selection = await validateBookingSelection(req.body);
  // MongoDB's partial unique index enforces the quota even for simultaneous requests.
  const appointment = await Appointment.create({ ...selection, user: req.user.id });
  const data = await getAppointment(appointment.id);
  return res.status(201).json({ success: true, data });
}

module.exports = { getAppointments, createAppointment };
