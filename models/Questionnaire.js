const mongoose = require('mongoose');

const QuestionnaireSchema = new mongoose.Schema({
  appointment: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', required: true, unique: true, immutable: true },
  reasonForVisit: { type: String, required: true, trim: true, maxlength: 500 },
  allergyInfo: { type: String, trim: true, maxlength: 1000, default: '' },
  notes: { type: String, trim: true, maxlength: 1000, default: '' },
}, { timestamps: true, strict: 'throw', versionKey: false });

module.exports = mongoose.model('Questionnaire', QuestionnaireSchema);
