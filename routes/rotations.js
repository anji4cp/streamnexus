const express = require('express');
const router = express.Router();
const rotationController = require('../controllers/rotationController');
const { isAuthenticated } = require('../middleware/authMiddleware');
const { uploadThumbnail } = require('../middleware/uploadMiddleware');

router.get('/rotations', isAuthenticated, rotationController.getRotationsView);

router.get('/api/rotations', isAuthenticated, rotationController.getRotations);
router.post('/api/rotations', isAuthenticated, uploadThumbnail.array('thumbnails'), rotationController.createRotation);

router.get('/api/rotations/:id', isAuthenticated, rotationController.getRotation);
router.put('/api/rotations/:id', isAuthenticated, uploadThumbnail.array('thumbnails'), rotationController.updateRotation);
router.delete('/api/rotations/:id', isAuthenticated, rotationController.deleteRotation);

router.post('/api/rotations/:id/activate', isAuthenticated, rotationController.activateRotation);
router.post('/api/rotations/:id/pause', isAuthenticated, rotationController.pauseRotation);
router.post('/api/rotations/:id/stop', isAuthenticated, rotationController.stopRotation);

module.exports = router;
