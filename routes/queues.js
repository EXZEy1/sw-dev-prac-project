// B owns this file after the P0 handoff.
const router = require('express').Router();
const { protect, authorize } = require('../middleware/auth');
const { pending } = require('../controllers/pending');
router.use(protect, authorize('admin'));
router.route('/').get(pending('Arrival queue')).post(pending('Mark arrival'));
router.patch('/:id', pending('Queue status'));
module.exports = router;
