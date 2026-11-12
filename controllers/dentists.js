const Dentist = require('../models/Dentist');
const { appError } = require('../utils/errors');
const { assertId } = require('../utils/validation');

const publicFields = 'name yearsOfExperience expertise';

async function getDentists(req, res) {
  const data = await Dentist.find().select(publicFields).sort({ name: 1, _id: 1 });
  return res.json({ success: true, count: data.length, data });
}

async function getDentist(req, res) {
  const data = await Dentist.findById(assertId(req.params.id, 'dentistId')).select(publicFields);
  if (!data) throw appError(404, 'NOT_FOUND', 'Dentist not found.');
  return res.json({ success: true, data });
}

module.exports = { getDentists, getDentist };
