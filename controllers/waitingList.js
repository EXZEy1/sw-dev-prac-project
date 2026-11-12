const WaitlistEntry = require('../models/WaitlistEntry');
const { validateBookingSelection } = require('../utils/booking');
const { appError } = require('../utils/errors');
const { assertId } = require('../utils/validation');
const { readQuery, readDentistDate } = require('../utils/filters');

function toWaitlistData(entry) {
  const user = entry.user;
  return {
    _id: entry.id,
    user: user._id ? user._id.toString() : user.toString(),
    userName: user.name ?? null,
    dentist: entry.dentist.toString(),
    bookingDate: entry.bookingDate,
    createdAt: entry.createdAt.toISOString(),
  };
}

async function getWaitingList(req, res) {
  const query = readQuery(req.query, ['dentist', 'bookingDate']);
  const isAdmin = req.user.role === 'admin';
  const filter = readDentistDate(query, { required: isAdmin });
  if (!isAdmin) filter.user = req.user.id;
  const entries = await WaitlistEntry.find(filter).sort({ createdAt: 1, _id: 1 }).populate('user', 'name');
  const data = entries.map(toWaitlistData);
  return res.json({ success: true, count: data.length, data });
}

async function joinWaitingList(req, res) {
  const selection = await validateBookingSelection(req.body);
  try {
    const entry = await WaitlistEntry.create({ user: req.user.id, ...selection });
    await entry.populate('user', 'name');
    return res.status(201).json({ success: true, data: toWaitlistData(entry) });
  } catch (error) {
    // The shared error handler would label any duplicate with a user key as a booking-limit error.
    if (error.code === 11000) throw appError(409, 'ALREADY_ON_WAITING_LIST', 'You are already on the waiting list for this dentist and date.');
    throw error;
  }
}

async function leaveWaitingList(req, res) {
  const id = assertId(req.params.id, 'waitlistEntryId');
  const entry = await WaitlistEntry.findOneAndDelete({ _id: id, user: req.user.id });
  if (!entry) throw appError(404, 'NOT_FOUND', 'Waiting list entry not found.');
  return res.json({ success: true, data: toWaitlistData(entry) });
}

module.exports = { getWaitingList, joinWaitingList, leaveWaitingList };
