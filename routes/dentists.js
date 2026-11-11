const router = require('express').Router();
const { protect } = require('../middleware/auth');
const { pending } = require('../controllers/pending');
router.use(protect);
router.get('/', pending('Dentist list - A/P1'));
router.get('/:id', pending('Dentist detail - A/P1'));
module.exports = router;
