// B owns this file after the P0 handoff. Replace placeholders with B controllers.
const router = require('express').Router();
const { protect, authorize } = require('../middleware/auth');
const { pending } = require('../controllers/pending');
router.use(protect, authorize('admin'));
router.route('/').get(pending('Admin booking list'));
router.route('/:id').get(pending('Admin booking detail')).patch(pending('Admin booking edit')).delete(pending('Admin booking cancellation'));
module.exports = router;
