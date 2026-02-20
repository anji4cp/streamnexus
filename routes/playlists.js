const express = require('express');
const router = express.Router();
const playlistController = require('../controllers/playlistController');
const { isAuthenticated } = require('../middleware/authMiddleware');
const { body } = require('express-validator');

router.get('/playlist', isAuthenticated, playlistController.getPlaylistView);

router.get('/api/playlists', isAuthenticated, playlistController.getPlaylists);
router.post('/api/playlists', isAuthenticated, [
    body('name').trim().isLength({ min: 1 }).withMessage('Playlist name is required')
], playlistController.createPlaylist);

router.get('/api/playlists/:id', isAuthenticated, playlistController.getPlaylist);
router.put('/api/playlists/:id', isAuthenticated, [
    body('name').trim().isLength({ min: 1 }).withMessage('Playlist name is required')
], playlistController.updatePlaylist);
router.delete('/api/playlists/:id', isAuthenticated, playlistController.deletePlaylist);

router.post('/api/playlists/:id/videos', isAuthenticated, [
    body('videoId').notEmpty().withMessage('Video ID is required')
], playlistController.addVideoToPlaylist);

router.delete('/api/playlists/:id/videos/:videoId', isAuthenticated, playlistController.removeVideoFromPlaylist);

router.put('/api/playlists/:id/videos/reorder', isAuthenticated, [
    body('videoPositions').isArray().withMessage('Video positions must be an array')
], playlistController.reorderVideos);

module.exports = router;
