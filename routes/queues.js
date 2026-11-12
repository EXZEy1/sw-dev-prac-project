const router = require('express').Router();
const { protect, authorize } = require('../middleware/auth');
const { getQueue, markArrival, updateQueueStatus } = require('../controllers/queues');

router.use(protect, authorize('admin'));
router.route('/').get(getQueue).post(markArrival);
router.patch('/:id', updateQueueStatus);
module.exports = router;
