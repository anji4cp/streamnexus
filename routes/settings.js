const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const { isAuthenticated } = require('../middleware/authMiddleware');
const { upload } = require('../middleware/uploadMiddleware');
const { body } = require('express-validator');
const multer = require('multer');

// Main Settings Page
router.get('/settings', isAuthenticated, settingsController.getSettings);

// Profile Settings
router.post('/settings/profile', isAuthenticated, (req, res, next) => {
    upload.single('avatar')(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            return res.redirect('/settings?error=' + encodeURIComponent(err.message) + '&activeTab=profile#profile');
        } else if (err) {
            return res.redirect('/settings?error=' + encodeURIComponent(err.message) + '&activeTab=profile#profile');
        }
        next();
    });
}, [
    body('username')
        .trim()
        .isLength({ min: 3, max: 20 })
        .withMessage('Username must be between 3 and 20 characters')
        .matches(/^[a-zA-Z0-9_]+$/)
        .withMessage('Username can only contain letters, numbers, and underscores'),
], settingsController.updateProfile);

// Security Settings
router.post('/settings/password', isAuthenticated, [
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    body('newPassword')
        .isLength({ min: 8 })
        .withMessage('Password must be at least 8 characters long')
        .matches(/[a-z]/).withMessage('Password must contain at least one lowercase letter')
        .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter')
        .matches(/[0-9]/).withMessage('Password must contain at least one number'),
    body('confirmPassword')
        .custom((value, { req }) => value === req.body.newPassword)
        .withMessage('Passwords do not match'),
], settingsController.updatePassword);

// Log Management
router.get('/api/settings/logs', isAuthenticated, settingsController.getLogs);
router.post('/api/settings/logs/clear', isAuthenticated, settingsController.clearLogs);

// Google Drive Integration
router.get('/api/settings/gdrive-status', isAuthenticated, settingsController.getGDriveStatus);
router.post('/api/settings/gdrive-api-key', isAuthenticated, [
    body('apiKey').notEmpty().withMessage('API Key is required'),
], settingsController.updateGDrive);
router.post('/settings/integrations/gdrive', isAuthenticated, [
    body('apiKey').notEmpty().withMessage('API Key is required'),
], settingsController.updateGDrive); // Supporting both endpoints as seen in app.js

// YouTube Integration
router.get('/api/settings/youtube-status', isAuthenticated, settingsController.getYouTubeStatus);
router.post('/api/settings/youtube-credentials', isAuthenticated, [
    body('clientId').notEmpty().withMessage('Client ID is required'),
    body('clientSecret').notEmpty().withMessage('Client Secret is required'),
], settingsController.updateYouTubeCredentials);
router.post('/api/settings/youtube-disconnect', isAuthenticated, settingsController.disconnectYouTube);

// YouTube Channel Management
router.get('/api/settings/youtube-channels', isAuthenticated, settingsController.getYouTubeChannels);
router.post('/api/settings/youtube-channel/:id/default', isAuthenticated, settingsController.setDefaultYouTubeChannel);
router.delete('/api/settings/youtube-channel/:id', isAuthenticated, settingsController.deleteYouTubeChannel);

// YouTube OAuth
router.get('/auth/youtube', isAuthenticated, settingsController.authYouTube);
router.get('/auth/youtube/callback', isAuthenticated, settingsController.authYouTubeCallback);

// ReCAPTCHA Settings
router.post('/api/settings/recaptcha', isAuthenticated, settingsController.updateRecaptcha);
router.post('/api/settings/recaptcha/toggle', isAuthenticated, settingsController.toggleRecaptcha);
router.delete('/api/settings/recaptcha', isAuthenticated, settingsController.deleteRecaptcha);

// Disk Usage
router.get('/api/user/disk-usage', isAuthenticated, settingsController.getDiskUsage);

module.exports = router;
