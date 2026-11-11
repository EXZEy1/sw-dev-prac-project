const router = require('express').Router();
const { protect } = require('../middleware/auth');
const { getDentists, getDentist } = require('../controllers/dentists');
router.use(protect);
router.get('/', getDentists);
router.get('/:id', getDentist);
module.exports = router;
