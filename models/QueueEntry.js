const mongoose = require('mongoose');
const { isCalendarDate } = require('../utils/validation');

const QUEUE_STATUSES = ['waiting', 'called', 'completed'];

const QueueEntrySchema = new mongoose.Schema({
  appointment: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', required: true, unique: true, immutable: true },
  dentist: { type: mongoose.Schema.Types.ObjectId, ref: 'Dentist', required: true },
  bookingDate: { type: String, required: true, validate: isCalendarDate },
  arrivedAt: { type: Date, required: true },
  status: { type: String, enum: QUEUE_STATUSES, default: 'waiting', required: true },
}, { timestamps: true, strict: 'throw', versionKey: false });

QueueEntrySchema.index({ dentist: 1, bookingDate: 1, arrivedAt: 1, _id: 1 });

module.exports = mongoose.model('QueueEntry', QueueEntrySchema);
module.exports.QUEUE_STATUSES = QUEUE_STATUSES;
