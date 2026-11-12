const router = require('express').Router();
const { protect, authorize } = require('../middleware/auth');
const { getAppointments, createAppointment, getOwnAppointment, updateOwnAppointment, cancelOwnAppointment } = require('../controllers/appointments');
const { getQuestionnaire, putQuestionnaire } = require('../controllers/questionnaire');
router.use(protect);
router.route('/:id/questionnaire')
  .get(authorize('user', 'admin'), getQuestionnaire)
  .put(authorize('user'), putQuestionnaire);
router.use(authorize('user'));
router.route('/').get(getAppointments).post(createAppointment);
router.route('/:id').get(getOwnAppointment).patch(updateOwnAppointment).delete(cancelOwnAppointment);
module.exports = router;
