const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { loginLimiter, loginDelayMiddleware } = require('../middleware/authLimiter');
const { upload } = require('../middleware/uploadMiddleware');
const { body } = require('express-validator');

// Login Routes
router.get('/login', authController.getLogin);
router.post('/login', loginDelayMiddleware, loginLimiter, [
    body('username').notEmpty().withMessage('Username is required'),
    body('password').notEmpty().withMessage('Password is required')
], authController.postLogin);
router.get('/logout', authController.logout);

// Signup Routes
router.get('/signup', authController.getSignup);
router.post('/signup', upload.single('avatar'), [
    body('username')
        .trim()
        .isLength({ min: 3, max: 20 })
        .withMessage('Username must be between 3 and 20 characters')
        .matches(/^[a-zA-Z0-9_]+$/)
        .withMessage('Username can only contain letters, numbers, and underscores'),
    body('password')
        .isLength({ min: 6 })
        .withMessage('Password must be at least 6 characters long'),
    body('confirmPassword')
        .custom((value, { req }) => value === req.body.password)
        .withMessage('Passwords do not match')
], authController.postSignup);

// Setup Account Routes
router.get('/setup-account', authController.getSetupAccount);
router.post('/setup-account', upload.single('avatar'), [
    body('username')
        .trim()
        .isLength({ min: 3, max: 20 })
        .withMessage('Username must be between 3 and 20 characters')
        .matches(/^[a-zA-Z0-9_]+$/)
        .withMessage('Username can only contain letters, numbers, and underscores'),
    body('password')
        .isLength({ min: 8 })
        .withMessage('Password must be at least 8 characters long')
        .matches(/[a-z]/).withMessage('Password must contain at least one lowercase letter')
        .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter')
        .matches(/[0-9]/).withMessage('Password must contain at least one number'),
    body('confirmPassword')
        .custom((value, { req }) => value === req.body.password)
        .withMessage('Passwords do not match')
], authController.postSetupAccount);

module.exports = router;
