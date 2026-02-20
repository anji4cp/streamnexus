const express = require('express');
const router = express.Router();
const streamController = require('../controllers/streamController');
const { isAuthenticated } = require('../middleware/authMiddleware');
const { uploadThumbnail } = require('../middleware/uploadMiddleware');
const { body } = require('express-validator');

// Stream Content for Creation
router.get('/api/stream/videos', isAuthenticated, streamController.getVideosForStream);
router.get('/api/stream/content', isAuthenticated, streamController.getContentForStream);

// Stream Management
router.get('/api/streams', isAuthenticated, streamController.getStreams);
router.post('/api/streams', isAuthenticated, [
    body('streamTitle').trim().isLength({ min: 1 }).withMessage('Title is required'),
    body('rtmpUrl').trim().isLength({ min: 1 }).withMessage('RTMP URL is required'),
    body('streamKey').trim().isLength({ min: 1 }).withMessage('Stream key is required')
], streamController.createStream);

router.post('/api/streams/youtube', isAuthenticated, uploadThumbnail.single('thumbnail'), streamController.createYouTubeStream);

router.get('/api/streams/check-key', isAuthenticated, streamController.checkStreamKey);

router.get('/api/streams/:id', isAuthenticated, streamController.getStream);
router.put('/api/streams/:id', isAuthenticated, uploadThumbnail.single('thumbnail'), streamController.updateStream);
router.delete('/api/streams/:id', isAuthenticated, streamController.deleteStream);

router.post('/api/streams/:id/status', isAuthenticated, [
    body('status').isIn(['live', 'offline', 'scheduled']).withMessage('Invalid status')
], streamController.updateStreamStatus);

router.get('/api/streams/:id/logs', isAuthenticated, streamController.getStreamLogs);

module.exports = router;
