const mongoose = require('mongoose');
const { isCalendarDate } = require('../utils/validation');

const AppointmentSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  dentist: { type: mongoose.Schema.Types.ObjectId, ref: 'Dentist', required: true },
  bookingDate: { type: String, required: true, validate: isCalendarDate },
  status: { type: String, enum: ['booked', 'cancelled'], default: 'booked', required: true },
  cancelledAt: { type: Date, default: null },
}, { timestamps: true, strict: 'throw' });

AppointmentSchema.index({ user: 1 }, { unique: true, partialFilterExpression: { status: 'booked' }, name: 'one_booked_appointment_per_user' });
AppointmentSchema.index({ dentist: 1, bookingDate: 1, status: 1 });

module.exports = mongoose.model('Appointment', AppointmentSchema);
