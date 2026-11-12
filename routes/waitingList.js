const router = require('express').Router();
const { protect, authorize } = require('../middleware/auth');
const { getWaitingList, joinWaitingList, leaveWaitingList } = require('../controllers/waitingList');

router.use(protect);
router.route('/').get(authorize('user', 'admin'), getWaitingList).post(authorize('user'), joinWaitingList);
router.delete('/:id', authorize('user'), leaveWaitingList);
module.exports = router;
