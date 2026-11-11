// B owns this file after the P0 handoff. DELETE must also verify ownership.
const router = require('express').Router();
const { protect, authorize } = require('../middleware/auth');
const { pending } = require('../controllers/pending');
router.use(protect);
router.get('/', pending('Waiting list read'));
router.post('/', authorize('user'), pending('Join waiting list'));
router.delete('/:id', authorize('user'), pending('Leave waiting list'));
module.exports = router;
