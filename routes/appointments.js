const router = require('express').Router();
const { protect, authorize } = require('../middleware/auth');
const { pending } = require('../controllers/pending');
const { getAppointments, createAppointment } = require('../controllers/appointments');
router.use(protect, authorize('user'));
router.route('/').get(getAppointments).post(createAppointment);
router.route('/:id').get(pending('Own booking detail - A/P1')).patch(pending('Own booking edit - A/P1')).delete(pending('Own booking cancellation - A/P1'));
module.exports = router;
