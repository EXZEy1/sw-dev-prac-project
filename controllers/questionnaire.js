const Questionnaire = require('../models/Questionnaire');
const { getAccessibleAppointment } = require('../utils/appointment-access');
const { allowFields, invalid } = require('../utils/validation');

async function getQuestionnaire(req, res) {
  const appointment = await getAccessibleAppointment(req.params.id, req.user, { allowAdmin: true });
  const data = await Questionnaire.findOne({ appointment: appointment._id });
  return res.json({ success: true, data });
}

async function putQuestionnaire(req, res) {
  const appointment = await getAccessibleAppointment(req.params.id, req.user);
  allowFields(req.body, ['reasonForVisit', 'allergyInfo', 'notes']);
  const answers = {};
  for (const [field, limit] of [['reasonForVisit', 500], ['allergyInfo', 1000], ['notes', 1000]]) {
    const value = req.body[field] === undefined && field !== 'reasonForVisit' ? '' : req.body[field];
    if (typeof value !== 'string' || value.trim().length > limit || (field === 'reasonForVisit' && !value.trim())) {
      throw invalid(`${field} must be text with ${field === 'reasonForVisit' ? '1' : '0'}–${limit} characters.`);
    }
    answers[field] = value.trim();
  }
  const result = await Questionnaire.findOneAndUpdate({ appointment: appointment._id }, { $set: answers }, {
    upsert: true, returnDocument: 'after', runValidators: true, includeResultMetadata: true,
  });
  return res.status(result.lastErrorObject.updatedExisting ? 200 : 201).json({ success: true, data: result.value });
}

module.exports = { getQuestionnaire, putQuestionnaire };
