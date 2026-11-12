const Appointment = require('../models/Appointment');
const QueueEntry = require('../models/QueueEntry');
const { QUEUE_STATUSES } = require('../models/QueueEntry');
const { appError } = require('../utils/errors');
const { invalid, allowFields, assertId } = require('../utils/validation');
const { readQuery, readDentistDate } = require('../utils/filters');

function toQueueData(entry, appointment) {
  return {
    _id: entry.id,
    appointment: entry.appointment.toString(),
    dentist: entry.dentist.toString(),
    bookingDate: entry.bookingDate,
    userName: appointment?.user?.name ?? null,
    arrivedAt: entry.arrivedAt.toISOString(),
    status: entry.status,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}

// An entry only counts while its booking is still booked for the same dentist and date.
function matchesAppointment(entry, appointment) {
  return Boolean(appointment) && appointment.status === 'booked'
    && appointment.dentist.toString() === entry.dentist.toString()
    && appointment.bookingDate === entry.bookingDate;
}

async function getQueue(req, res) {
  const filter = readDentistDate(readQuery(req.query, ['dentist', 'bookingDate']), { required: true });
  const entries = await QueueEntry.find(filter).sort({ arrivedAt: 1, _id: 1 });
  const appointments = await Appointment.find({ _id: { $in: entries.map((entry) => entry.appointment) } }).populate('user', 'name');
  const byId = new Map(appointments.map((appointment) => [appointment.id, appointment]));
  const data = entries
    .filter((entry) => matchesAppointment(entry, byId.get(entry.appointment.toString())))
    .map((entry) => toQueueData(entry, byId.get(entry.appointment.toString())));
  return res.json({ success: true, count: data.length, data });
}

async function markArrival(req, res) {
  allowFields(req.body, ['appointmentId']);
  const appointmentId = assertId(req.body.appointmentId, 'appointmentId');
  const appointment = await Appointment.findById(appointmentId).populate('user', 'name');
  if (!appointment) throw appError(404, 'NOT_FOUND', 'Appointment not found.');
  if (appointment.status !== 'booked') throw appError(409, 'APPOINTMENT_CANCELLED', 'Cannot queue a cancelled appointment.');

  const current = { dentist: appointment.dentist, bookingDate: appointment.bookingDate };
  const existing = await QueueEntry.findOne({ appointment: appointmentId });
  if (existing && matchesAppointment(existing, appointment)) {
    return res.json({ success: true, data: toQueueData(existing, appointment) });
  }
  if (existing) {
    // The booking moved to another dentist or date, so this is a new arrival.
    const moved = await QueueEntry.findByIdAndUpdate(existing.id, {
      $set: { ...current, arrivedAt: new Date(), status: 'waiting' },
    }, { returnDocument: 'after', runValidators: true });
    return res.json({ success: true, data: toQueueData(moved, appointment) });
  }
  try {
    const entry = await QueueEntry.create({ appointment: appointmentId, ...current, arrivedAt: new Date() });
    return res.status(201).json({ success: true, data: toQueueData(entry, appointment) });
  } catch (error) {
    if (error.code !== 11000) throw error;
    const entry = await QueueEntry.findOne({ appointment: appointmentId });
    return res.json({ success: true, data: toQueueData(entry, appointment) });
  }
}

async function updateQueueStatus(req, res) {
  const id = assertId(req.params.id, 'queueEntryId');
  allowFields(req.body, ['status']);
  const { status } = req.body;
  if (!QUEUE_STATUSES.includes(status)) throw invalid(`status must be one of: ${QUEUE_STATUSES.join(', ')}.`);

  const entry = await QueueEntry.findById(id);
  if (!entry) throw appError(404, 'NOT_FOUND', 'Queue entry not found.');
  const appointment = await Appointment.findById(entry.appointment).populate('user', 'name');
  if (!matchesAppointment(entry, appointment)) {
    throw appError(409, 'QUEUE_ENTRY_INACTIVE', 'The booking for this queue entry was cancelled or changed.');
  }
  if (entry.status === status) return res.json({ success: true, data: toQueueData(entry, appointment) });

  if (QUEUE_STATUSES.indexOf(status) !== QUEUE_STATUSES.indexOf(entry.status) + 1) {
    throw appError(409, 'INVALID_QUEUE_TRANSITION', `Cannot change queue status from ${entry.status} to ${status}.`);
  }
  const updated = await QueueEntry.findOneAndUpdate({ _id: id, status: entry.status }, { $set: { status } }, {
    returnDocument: 'after', runValidators: true,
  });
  if (!updated) throw appError(409, 'INVALID_QUEUE_TRANSITION', 'Queue status changed during this request.');
  return res.json({ success: true, data: toQueueData(updated, appointment) });
}

module.exports = { getQueue, markArrival, updateQueueStatus };
