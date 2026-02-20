const Rotation = require('../models/Rotation');
const Video = require('../models/Video');
const Playlist = require('../models/Playlist');
const User = require('../models/User');
const YoutubeChannel = require('../models/YoutubeChannel');
const rotationService = require('../services/rotationService');
const { generateImageThumbnail } = require('../utils/videoProcessor');
const path = require('path');
const fs = require('fs');

exports.getRotationsView = async (req, res) => {
    try {
        const user = await User.findById(req.session.userId);
        const allVideos = await Video.findAll(req.session.userId);
        const videos = allVideos.filter(video => {
            const filepath = (video.filepath || '').toLowerCase();
            if (filepath.includes('/audio/')) return false;
            if (filepath.endsWith('.m4a') || filepath.endsWith('.aac') || filepath.endsWith('.mp3')) return false;
            return true;
        });
        const playlists = await Playlist.findAll(req.session.userId);
        const rotations = await Rotation.findAll(req.session.userId);
        const youtubeChannels = await YoutubeChannel.findAll(req.session.userId);
        const isYoutubeConnected = youtubeChannels.length > 0;
        const defaultChannel = youtubeChannels.find(c => c.is_default) || youtubeChannels[0];

        res.render('rotations', {
            title: 'Stream Rotations',
            active: 'rotations',
            user: user,
            videos: videos,
            playlists: playlists,
            rotations: rotations,
            youtubeConnected: isYoutubeConnected,
            youtubeChannels: youtubeChannels,
            youtubeChannelName: defaultChannel?.channel_name || '',
            youtubeChannelThumbnail: defaultChannel?.channel_thumbnail || '',
            youtubeSubscriberCount: defaultChannel?.subscriber_count || '0'
        });
    } catch (error) {
        console.error('Rotations page error:', error);
        res.redirect('/dashboard');
    }
};

exports.getRotations = async (req, res) => {
    try {
        const rotations = await Rotation.findAll(req.session.userId);
        res.json({ success: true, rotations });
    } catch (error) {
        console.error('Error fetching rotations:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch rotations' });
    }
};

exports.getRotation = async (req, res) => {
    try {
        const rotation = await Rotation.findByIdWithItems(req.params.id);
        if (!rotation) {
            return res.status(404).json({ success: false, error: 'Rotation not found' });
        }
        if (rotation.user_id !== req.session.userId) {
            return res.status(403).json({ success: false, error: 'Not authorized' });
        }
        res.json({ success: true, rotation });
    } catch (error) {
        console.error('Error fetching rotation:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch rotation' });
    }
};

exports.createRotation = async (req, res) => {
    try {
        const { name, repeat_mode, start_time, end_time, items, youtube_channel_id } = req.body;

        const parsedItems = typeof items === 'string' ? JSON.parse(items) : items;

        if (!name || !parsedItems || parsedItems.length === 0) {
            return res.status(400).json({ success: false, error: 'Name and at least one item are required' });
        }

        if (!start_time || !end_time) {
            return res.status(400).json({ success: false, error: 'Start time and end time are required' });
        }

        const rotation = await Rotation.create({
            user_id: req.session.userId,
            name,
            is_loop: true,
            start_time,
            end_time,
            repeat_mode: repeat_mode || 'daily',
            youtube_channel_id: youtube_channel_id || null
        });

        const uploadedFiles = req.files || [];

        for (let i = 0; i < parsedItems.length; i++) {
            const item = parsedItems[i];
            const thumbnailFile = uploadedFiles[i];

            let thumbnailPath = null;
            let originalThumbnailPath = null;
            if (thumbnailFile && thumbnailFile.size > 0) {
                const originalFilename = thumbnailFile.filename;
                const thumbFilename = `thumb-${path.parse(originalFilename).name}.jpg`;

                originalThumbnailPath = originalFilename;

                try {
                    await generateImageThumbnail(thumbnailFile.path, thumbFilename);
                    thumbnailPath = thumbFilename;
                } catch (thumbErr) {
                    console.error('Error generating rotation thumbnail:', thumbErr);
                    thumbnailPath = originalFilename;
                }
            }

            await Rotation.addItem({
                rotation_id: rotation.id,
                order_index: item.order_index,
                video_id: item.video_id,
                title: item.title,
                description: item.description || '',
                tags: item.tags || '',
                thumbnail_path: thumbnailPath,
                original_thumbnail_path: originalThumbnailPath,
                privacy: item.privacy || 'unlisted',
                category: item.category || '22'
            });
        }

        res.json({ success: true, rotation });
    } catch (error) {
        console.error('Error creating rotation:', error);
        res.status(500).json({ success: false, error: 'Failed to create rotation' });
    }
};

exports.updateRotation = async (req, res) => {
    try {
        const rotation = await Rotation.findById(req.params.id);
        if (!rotation) {
            return res.status(404).json({ success: false, error: 'Rotation not found' });
        }
        if (rotation.user_id !== req.session.userId) {
            return res.status(403).json({ success: false, error: 'Not authorized' });
        }

        const { name, repeat_mode, start_time, end_time, items, youtube_channel_id } = req.body;

        const parsedItems = typeof items === 'string' ? JSON.parse(items) : items;

        await Rotation.update(req.params.id, {
            name,
            is_loop: true,
            start_time,
            end_time,
            repeat_mode: repeat_mode || 'daily',
            youtube_channel_id: youtube_channel_id || null
        });

        const existingItems = await Rotation.getItemsByRotationId(req.params.id);
        for (const item of existingItems) {
            await Rotation.deleteItem(item.id);
        }

        const uploadedFiles = req.files || [];

        for (let i = 0; i < parsedItems.length; i++) {
            const item = parsedItems[i];
            const thumbnailFile = uploadedFiles[i];

            let thumbnailPath = item.thumbnail_path || null;
            let originalThumbnailPath = item.original_thumbnail_path || null;
            if (thumbnailFile && thumbnailFile.size > 0) {
                const originalFilename = thumbnailFile.filename;
                const thumbFilename = `thumb-${path.parse(originalFilename).name}.jpg`;

                originalThumbnailPath = originalFilename;

                try {
                    await generateImageThumbnail(thumbnailFile.path, thumbFilename);
                    thumbnailPath = thumbFilename;
                } catch (thumbErr) {
                    console.error('Error generating rotation thumbnail:', thumbErr);
                    thumbnailPath = originalFilename;
                }
            }

            await Rotation.addItem({
                rotation_id: req.params.id,
                order_index: item.order_index,
                video_id: item.video_id,
                title: item.title,
                description: item.description || '',
                tags: item.tags || '',
                thumbnail_path: thumbnailPath,
                original_thumbnail_path: originalThumbnailPath,
                privacy: item.privacy || 'unlisted',
                category: item.category || '22'
            });
        }

        res.json({ success: true, message: 'Rotation updated' });
    } catch (error) {
        console.error('Error updating rotation:', error);
        res.status(500).json({ success: false, error: 'Failed to update rotation' });
    }
};

exports.deleteRotation = async (req, res) => {
    try {
        const rotation = await Rotation.findById(req.params.id);
        if (!rotation) {
            return res.status(404).json({ success: false, error: 'Rotation not found' });
        }
        if (rotation.user_id !== req.session.userId) {
            return res.status(403).json({ success: false, error: 'Not authorized' });
        }

        if (rotation.status === 'active') {
            await rotationService.stopRotation(req.params.id);
        }

        await Rotation.delete(req.params.id, req.session.userId);
        res.json({ success: true, message: 'Rotation deleted' });
    } catch (error) {
        console.error('Error deleting rotation:', error);
        res.status(500).json({ success: false, error: 'Failed to delete rotation' });
    }
};

exports.activateRotation = async (req, res) => {
    try {
        const rotation = await Rotation.findById(req.params.id);
        if (!rotation) {
            return res.status(404).json({ success: false, error: 'Rotation not found' });
        }
        if (rotation.user_id !== req.session.userId) {
            return res.status(403).json({ success: false, error: 'Not authorized' });
        }

        const result = await rotationService.activateRotation(req.params.id);
        res.json(result);
    } catch (error) {
        console.error('Error activating rotation:', error);
        res.status(500).json({ success: false, error: 'Failed to activate rotation' });
    }
};

exports.pauseRotation = async (req, res) => {
    try {
        const rotation = await Rotation.findById(req.params.id);
        if (!rotation) {
            return res.status(404).json({ success: false, error: 'Rotation not found' });
        }
        if (rotation.user_id !== req.session.userId) {
            return res.status(403).json({ success: false, error: 'Not authorized' });
        }

        const result = await rotationService.pauseRotation(req.params.id);
        res.json(result);
    } catch (error) {
        console.error('Error pausing rotation:', error);
        res.status(500).json({ success: false, error: 'Failed to pause rotation' });
    }
};

exports.stopRotation = async (req, res) => {
    try {
        const rotation = await Rotation.findById(req.params.id);
        if (!rotation) {
            return res.status(404).json({ success: false, error: 'Rotation not found' });
        }
        if (rotation.user_id !== req.session.userId) {
            return res.status(403).json({ success: false, error: 'Not authorized' });
        }

        const result = await rotationService.stopRotation(req.params.id);
        res.json(result);
    } catch (error) {
        console.error('Error stopping rotation:', error);
        res.status(500).json({ success: false, error: 'Failed to stop rotation' });
    }
};
