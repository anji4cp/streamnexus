const express = require('express');
const router = express.Router();
const indexController = require('../controllers/indexController');
const { isAuthenticated } = require('../middleware/authMiddleware');

router.get('/', indexController.getIndex);
router.get('/dashboard', isAuthenticated, indexController.getDashboard);
router.get('/welcome', isAuthenticated, indexController.getWelcome);
router.get('/api/donators', indexController.getDonators);
router.get('/api/server-time', indexController.getServerTime);
router.get('/welcome-bypass', indexController.getWelcomeBypass);
router.get('/welcome/continue', isAuthenticated, indexController.getWelcomeContinue);

module.exports = router;
