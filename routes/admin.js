const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { isAdmin, isAuthenticated } = require('../middleware/authMiddleware');
const { upload } = require('../middleware/uploadMiddleware');

router.get('/users', isAdmin, adminController.getUsers);
router.post('/api/users/status', isAdmin, adminController.updateUserStatus);
router.post('/api/users/role', isAdmin, adminController.updateUserRole);
router.post('/api/users/delete', isAdmin, adminController.deleteUser);
router.post('/api/users/update', isAdmin, upload.single('avatar'), adminController.updateUser);
router.post('/api/users/create', isAdmin, upload.single('avatar'), adminController.createUser);
router.get('/api/users/:id/videos', isAdmin, adminController.getUserVideos);
router.get('/api/users/:id/streams', isAdmin, adminController.getUserStreams);
router.get('/api/system-stats', isAuthenticated, adminController.getSystemStats); // Originally used isAuthenticated in app.js

module.exports = router;
