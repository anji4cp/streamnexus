const express = require('express');
const router = express.Router();
const videoController = require('../controllers/videoController');
const { isAuthenticated } = require('../middleware/authMiddleware');
const { uploadVideo, uploadAudio } = require('../middleware/uploadMiddleware');
const { body } = require('express-validator');

// Gallery & History
router.get('/gallery', isAuthenticated, videoController.getGallery);
router.get('/history', isAuthenticated, videoController.getHistory);
router.delete('/api/history/:id', isAuthenticated, videoController.deleteHistoryItem);

// Video Uploads
router.post('/upload/video', isAuthenticated, uploadVideo.single('video'), videoController.uploadVideo);

router.post('/api/videos/upload', isAuthenticated, (req, res, next) => {
    uploadVideo.single('video')(req, res, (err) => {
        if (err) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(413).json({
                    success: false,
                    error: 'File too large. Maximum size is 50GB.'
                });
            }
            if (err.code === 'LIMIT_UNEXPECTED_FILE') {
                return res.status(400).json({
                    success: false,
                    error: 'Unexpected file field.'
                });
            }
            return res.status(400).json({
                success: false,
                error: err.message
            });
        }
        next();
    });
}, videoController.apiUploadVideo);

router.post('/api/audio/upload', isAuthenticated, (req, res, next) => {
    uploadAudio.single('audio')(req, res, (err) => {
        if (err) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(413).json({
                    success: false,
                    error: 'File too large. Maximum size is 50GB.'
                });
            }
            return res.status(400).json({
                success: false,
                error: err.message
            });
        }
        next();
    });
}, videoController.uploadAudio);

// Chunk Uploads
router.post('/api/videos/chunk/init', isAuthenticated, videoController.initChunkUpload);
router.post('/api/videos/chunk/upload', isAuthenticated, express.raw({ type: 'application/octet-stream', limit: '60mb' }), videoController.uploadChunk);
router.get('/api/videos/chunk/status/:uploadId', isAuthenticated, videoController.getChunkStatus);
router.post('/api/videos/chunk/complete', isAuthenticated, videoController.completeChunkUpload);
router.post('/api/videos/chunk/pause', isAuthenticated, videoController.pauseChunkUpload);
router.delete('/api/videos/chunk/:uploadId', isAuthenticated, videoController.deleteChunkUpload);

// Video Management
router.get('/api/videos', isAuthenticated, videoController.getVideos);
router.delete('/api/videos/:id', isAuthenticated, videoController.deleteVideo);
router.post('/api/videos/:id/rename', isAuthenticated, [
    body('title').trim().isLength({ min: 1 }).withMessage('Title cannot be empty')
], videoController.renameVideo);

// Streaming
router.get('/stream/:videoId', isAuthenticated, videoController.streamVideo);

// Imports
router.post('/api/videos/import-drive', isAuthenticated, [
    body('driveUrl').notEmpty().withMessage('Google Drive URL is required')
], videoController.importFromDrive);

router.post('/api/videos/import-mediafire', isAuthenticated, [
    body('mediafireUrl').notEmpty().withMessage('Mediafire URL is required')
], videoController.importFromMediafire);

router.post('/api/videos/import-dropbox', isAuthenticated, [
    body('dropboxUrl').notEmpty().withMessage('Dropbox URL is required')
], videoController.importFromDropbox);

router.post('/api/videos/import-mega', isAuthenticated, [
    body('megaUrl').notEmpty().withMessage('MEGA URL is required')
], videoController.importFromMega);

router.get('/api/videos/import-status/:jobId', isAuthenticated, videoController.getImportStatus);

module.exports = router;
