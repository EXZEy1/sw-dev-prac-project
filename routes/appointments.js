const router = require('express').Router();
const { protect, authorize } = require('../middleware/auth');
const { pending } = require('../controllers/pending');
router.use(protect, authorize('user'));
router.route('/').get(pending('Own booking list - A/P1')).post(pending('Create booking - A/P1'));
router.route('/:id').get(pending('Own booking detail - A/P1')).patch(pending('Own booking edit - A/P1')).delete(pending('Own booking cancellation - A/P1'));
module.exports = router;
