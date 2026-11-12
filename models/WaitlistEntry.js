const mongoose = require('mongoose');
const { isCalendarDate } = require('../utils/validation');

const WaitlistEntrySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  dentist: { type: mongoose.Schema.Types.ObjectId, ref: 'Dentist', required: true, immutable: true },
  bookingDate: { type: String, required: true, immutable: true, validate: isCalendarDate },
}, { timestamps: true, strict: 'throw', versionKey: false });

WaitlistEntrySchema.index({ user: 1, dentist: 1, bookingDate: 1 }, { unique: true, name: 'one_waitlist_entry_per_user_dentist_date' });
WaitlistEntrySchema.index({ dentist: 1, bookingDate: 1, createdAt: 1, _id: 1 });

module.exports = mongoose.model('WaitlistEntry', WaitlistEntrySchema);
