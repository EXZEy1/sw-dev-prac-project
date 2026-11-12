const router = require('express').Router();
const { protect, authorize } = require('../middleware/auth');
const {
  getAllAppointments, getAnyAppointment, updateAnyAppointment, cancelAnyAppointment,
} = require('../controllers/adminAppointments');

router.use(protect, authorize('admin'));
router.route('/').get(getAllAppointments);
router.route('/:id').get(getAnyAppointment).patch(updateAnyAppointment).delete(cancelAnyAppointment);
module.exports = router;
