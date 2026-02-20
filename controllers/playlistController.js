const Playlist = require('../models/Playlist');
const Video = require('../models/Video');
const User = require('../models/User');
const { validationResult } = require('express-validator');

exports.getPlaylistView = async (req, res) => {
    try {
        const playlists = await Playlist.findAll(req.session.userId);
        const allVideos = await Video.findAll(req.session.userId);
        const videos = allVideos.filter(video => {
            const filepath = (video.filepath || '').toLowerCase();
            if (filepath.includes('/audio/')) return false;
            if (filepath.endsWith('.m4a') || filepath.endsWith('.aac') || filepath.endsWith('.mp3')) return false;
            return true;
        });
        const audios = allVideos.filter(video => {
            const filepath = (video.filepath || '').toLowerCase();
            return filepath.includes('/audio/') || filepath.endsWith('.m4a') || filepath.endsWith('.aac') || filepath.endsWith('.mp3');
        });
        res.render('playlist', {
            title: 'Playlist',
            active: 'playlist',
            user: await User.findById(req.session.userId),
            playlists: playlists,
            videos: videos,
            audios: audios
        });
    } catch (error) {
        console.error('Playlist error:', error);
        res.redirect('/dashboard');
    }
};

exports.getPlaylists = async (req, res) => {
    try {
        const playlists = await Playlist.findAll(req.session.userId);
        playlists.forEach(playlist => {
            playlist.shuffle = playlist.is_shuffle;
        });
        res.json({ success: true, playlists });
    } catch (error) {
        console.error('Error fetching playlists:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch playlists' });
    }
};

exports.createPlaylist = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        const playlistData = {
            name: req.body.name,
            description: req.body.description || null,
            is_shuffle: req.body.shuffle === 'true' || req.body.shuffle === true,
            user_id: req.session.userId
        };

        const playlist = await Playlist.create(playlistData);

        if (req.body.videos && Array.isArray(req.body.videos) && req.body.videos.length > 0) {
            for (let i = 0; i < req.body.videos.length; i++) {
                await Playlist.addVideo(playlist.id, req.body.videos[i], i + 1);
            }
        }

        if (req.body.audios && Array.isArray(req.body.audios) && req.body.audios.length > 0) {
            for (let i = 0; i < req.body.audios.length; i++) {
                await Playlist.addAudio(playlist.id, req.body.audios[i], i + 1);
            }
        }

        res.json({ success: true, playlist });
    } catch (error) {
        console.error('Error creating playlist:', error);
        res.status(500).json({ success: false, error: 'Failed to create playlist' });
    }
};

exports.getPlaylist = async (req, res) => {
    try {
        const playlist = await Playlist.findByIdWithVideos(req.params.id);
        if (!playlist) {
            return res.status(404).json({ success: false, error: 'Playlist not found' });
        }
        if (playlist.user_id !== req.session.userId) {
            return res.status(403).json({ success: false, error: 'Not authorized' });
        }

        playlist.shuffle = playlist.is_shuffle;

        res.json({ success: true, playlist });
    } catch (error) {
        console.error('Error fetching playlist:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch playlist' });
    }
};

exports.updatePlaylist = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        const playlist = await Playlist.findById(req.params.id);
        if (!playlist) {
            return res.status(404).json({ success: false, error: 'Playlist not found' });
        }
        if (playlist.user_id !== req.session.userId) {
            return res.status(403).json({ success: false, error: 'Not authorized' });
        }

        const updateData = {
            name: req.body.name,
            description: req.body.description || null,
            is_shuffle: req.body.shuffle === 'true' || req.body.shuffle === true
        };

        const updatedPlaylist = await Playlist.update(req.params.id, updateData);

        if (req.body.videos && Array.isArray(req.body.videos)) {
            const existingVideos = await Playlist.findByIdWithVideos(req.params.id);
            if (existingVideos && existingVideos.videos) {
                for (const video of existingVideos.videos) {
                    await Playlist.removeVideo(req.params.id, video.id);
                }
            }

            for (let i = 0; i < req.body.videos.length; i++) {
                await Playlist.addVideo(req.params.id, req.body.videos[i], i + 1);
            }
        }

        if (req.body.audios && Array.isArray(req.body.audios)) {
            await Playlist.clearAudios(req.params.id);
            for (let i = 0; i < req.body.audios.length; i++) {
                await Playlist.addAudio(req.params.id, req.body.audios[i], i + 1);
            }
        }

        res.json({ success: true, playlist: updatedPlaylist });
    } catch (error) {
        console.error('Error updating playlist:', error);
        res.status(500).json({ success: false, error: 'Failed to update playlist' });
    }
};

exports.deletePlaylist = async (req, res) => {
    try {
        const playlist = await Playlist.findById(req.params.id);
        if (!playlist) {
            return res.status(404).json({ success: false, error: 'Playlist not found' });
        }
        if (playlist.user_id !== req.session.userId) {
            return res.status(403).json({ success: false, error: 'Not authorized' });
        }

        await Playlist.delete(req.params.id);
        res.json({ success: true, message: 'Playlist deleted successfully' });
    } catch (error) {
        console.error('Error deleting playlist:', error);
        res.status(500).json({ success: false, error: 'Failed to delete playlist' });
    }
};

exports.addVideoToPlaylist = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        const playlist = await Playlist.findById(req.params.id);
        if (!playlist) {
            return res.status(404).json({ success: false, error: 'Playlist not found' });
        }
        if (playlist.user_id !== req.session.userId) {
            return res.status(403).json({ success: false, error: 'Not authorized' });
        }

        const video = await Video.findById(req.body.videoId);
        if (!video || video.user_id !== req.session.userId) {
            return res.status(404).json({ success: false, error: 'Video not found' });
        }

        const position = await Playlist.getNextPosition(req.params.id);
        await Playlist.addVideo(req.params.id, req.body.videoId, position);

        res.json({ success: true, message: 'Video added to playlist' });
    } catch (error) {
        console.error('Error adding video to playlist:', error);
        res.status(500).json({ success: false, error: 'Failed to add video to playlist' });
    }
};

exports.removeVideoFromPlaylist = async (req, res) => {
    try {
        const playlist = await Playlist.findById(req.params.id);
        if (!playlist) {
            return res.status(404).json({ success: false, error: 'Playlist not found' });
        }
        if (playlist.user_id !== req.session.userId) {
            return res.status(403).json({ success: false, error: 'Not authorized' });
        }

        await Playlist.removeVideo(req.params.id, req.params.videoId);
        res.json({ success: true, message: 'Video removed from playlist' });
    } catch (error) {
        console.error('Error removing video from playlist:', error);
        res.status(500).json({ success: false, error: 'Failed to remove video from playlist' });
    }
};

exports.reorderVideos = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        const playlist = await Playlist.findById(req.params.id);
        if (!playlist) {
            return res.status(404).json({ success: false, error: 'Playlist not found' });
        }
        if (playlist.user_id !== req.session.userId) {
            return res.status(403).json({ success: false, error: 'Not authorized' });
        }

        await Playlist.updateVideoPositions(req.params.id, req.body.videoPositions);
        res.json({ success: true, message: 'Video order updated' });
    } catch (error) {
        console.error('Error reordering videos:', error);
        res.status(500).json({ success: false, error: 'Failed to reorder videos' });
    }
};
