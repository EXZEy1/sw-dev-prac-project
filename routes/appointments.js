const router = require('express').Router();
const { protect, authorize } = require('../middleware/auth');
const { getAppointments, createAppointment, getOwnAppointment, updateOwnAppointment, cancelOwnAppointment } = require('../controllers/appointments');
router.use(protect, authorize('user'));
router.route('/').get(getAppointments).post(createAppointment);
router.route('/:id').get(getOwnAppointment).patch(updateOwnAppointment).delete(cancelOwnAppointment);
module.exports = router;
