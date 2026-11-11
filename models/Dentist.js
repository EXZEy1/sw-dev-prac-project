const mongoose = require('mongoose');

const DentistSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  yearsOfExperience: { type: Number, required: true, min: 0, validate: Number.isInteger },
  expertise: { type: String, required: true, trim: true, maxlength: 200 },
}, { timestamps: true, strict: 'throw' });

module.exports = mongoose.model('Dentist', DentistSchema);
