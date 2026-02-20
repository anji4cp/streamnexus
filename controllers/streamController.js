const Stream = require('../models/Stream');
const Video = require('../models/Video');
const Playlist = require('../models/Playlist');
const User = require('../models/User');
const YoutubeChannel = require('../models/YoutubeChannel');
const streamingService = require('../services/streamingService');
const { encrypt, decrypt } = require('../utils/encryption');
const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');
const { validationResult } = require('express-validator');
const { generateImageThumbnail } = require('../utils/videoProcessor');

function getYouTubeOAuth2Client(clientId, clientSecret, redirectUri) {
    return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

exports.getContentForStream = async (req, res) => {
    try {
        const allVideos = await Video.findAll(req.session.userId);
        const videos = allVideos.filter(video => {
            const filepath = (video.filepath || '').toLowerCase();
            if (filepath.includes('/audio/')) return false;
            if (filepath.endsWith('.m4a') || filepath.endsWith('.aac') || filepath.endsWith('.mp3')) return false;
            return true;
        });
        const formattedVideos = videos.map(video => {
            const duration = video.duration ? Math.floor(video.duration) : 0;
            const minutes = Math.floor(duration / 60);
            const seconds = Math.floor(duration % 60);
            const formattedDuration = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            return {
                id: video.id,
                name: video.title,
                thumbnail: video.thumbnail_path,
                resolution: video.resolution || '1280x720',
                duration: formattedDuration,
                url: `/stream/${video.id}`,
                type: 'video'
            };
        });

        const playlists = await Playlist.findAll(req.session.userId);
        const formattedPlaylists = playlists.map(playlist => {
            return {
                id: playlist.id,
                name: playlist.name,
                thumbnail: '/images/playlist-thumbnail.svg',
                resolution: 'Playlist',
                duration: `${playlist.video_count || 0} videos`,
                videoCount: playlist.video_count || 0,
                audioCount: playlist.audio_count || 0,
                url: `/playlist/${playlist.id}`,
                type: 'playlist',
                description: playlist.description,
                is_shuffle: playlist.is_shuffle
            };
        });

        const allContent = [...formattedPlaylists, ...formattedVideos];

        res.json(allContent);
    } catch (error) {
        console.error('Error fetching content for stream:', error);
        res.status(500).json({ error: 'Failed to load content' });
    }
};

exports.getVideosForStream = async (req, res) => {
    try {
        const allVideos = await Video.findAll(req.session.userId);
        const videos = allVideos.filter(video => {
            const filepath = (video.filepath || '').toLowerCase();
            if (filepath.includes('/audio/')) return false;
            if (filepath.endsWith('.m4a') || filepath.endsWith('.aac') || filepath.endsWith('.mp3')) return false;
            return true;
        });
        const formattedVideos = videos.map(video => {
            const duration = video.duration ? Math.floor(video.duration) : 0;
            const minutes = Math.floor(duration / 60);
            const seconds = Math.floor(duration % 60);
            const formattedDuration = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            return {
                id: video.id,
                name: video.title,
                thumbnail: video.thumbnail_path,
                resolution: video.resolution || '1280x720',
                duration: formattedDuration,
                url: `/stream/${video.id}`,
                type: 'video'
            };
        });
        res.json(formattedVideos);
    } catch (error) {
        console.error('Error fetching videos for stream:', error);
        res.status(500).json({ error: 'Failed to load videos' });
    }
};

exports.getStreams = async (req, res) => {
    try {
        const filter = req.query.filter;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const search = req.query.search || '';
        if (req.query.page || req.query.limit) {
            const result = await Stream.findAllPaginated(req.session.userId, {
                page,
                limit,
                filter,
                search
            });
            res.json({ success: true, ...result });
        } else {
            const streams = await Stream.findAll(req.session.userId, filter);
            res.json({ success: true, streams });
        }
    } catch (error) {
        console.error('Error fetching streams:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch streams' });
    }
};

exports.createStream = async (req, res) => {
    try {
        console.log('Session userId for stream creation:', req.session.userId);
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, error: errors.array()[0].msg });
        }
        let platform = 'Custom';
        let platform_icon = 'ti-broadcast';
        if (req.body.rtmpUrl.includes('youtube.com')) {
            platform = 'YouTube';
            platform_icon = 'ti-brand-youtube';
        } else if (req.body.rtmpUrl.includes('facebook.com')) {
            platform = 'Facebook';
            platform_icon = 'ti-brand-facebook';
        } else if (req.body.rtmpUrl.includes('twitch.tv')) {
            platform = 'Twitch';
            platform_icon = 'ti-brand-twitch';
        } else if (req.body.rtmpUrl.includes('tiktok.com')) {
            platform = 'TikTok';
            platform_icon = 'ti-brand-tiktok';
        } else if (req.body.rtmpUrl.includes('instagram.com')) {
            platform = 'Instagram';
            platform_icon = 'ti-brand-instagram';
        } else if (req.body.rtmpUrl.includes('shopee.io')) {
            platform = 'Shopee Live';
            platform_icon = 'ti-brand-shopee';
        } else if (req.body.rtmpUrl.includes('restream.io')) {
            platform = 'Restream.io';
            platform_icon = 'ti-live-photo';
        }
        const streamData = {
            title: req.body.streamTitle,
            video_id: req.body.videoId || null,
            rtmp_url: req.body.rtmpUrl,
            stream_key: req.body.streamKey,
            platform,
            platform_icon,
            bitrate: parseInt(req.body.bitrate) || 2500,
            resolution: req.body.resolution || '1280x720',
            fps: parseInt(req.body.fps) || 30,
            orientation: req.body.orientation || 'horizontal',
            loop_video: req.body.loopVideo === 'true' || req.body.loopVideo === true,
            use_advanced_settings: req.body.useAdvancedSettings === 'true' || req.body.useAdvancedSettings === true,
            user_id: req.session.userId
        };

        function parseLocalDateTime(dateTimeString) {
            const [datePart, timePart] = dateTimeString.split('T');
            const [year, month, day] = datePart.split('-').map(Number);
            const [hours, minutes] = timePart.split(':').map(Number);

            return new Date(year, month - 1, day, hours, minutes);
        }

        if (req.body.scheduleStartTime) {
            const scheduleStartDate = parseLocalDateTime(req.body.scheduleStartTime);
            streamData.schedule_time = scheduleStartDate.toISOString();
            streamData.status = 'scheduled';

            if (req.body.scheduleEndTime) {
                const scheduleEndDate = parseLocalDateTime(req.body.scheduleEndTime);

                if (scheduleEndDate <= scheduleStartDate) {
                    return res.status(400).json({
                        success: false,
                        error: 'End time must be after start time'
                    });
                }

                streamData.end_time = scheduleEndDate.toISOString();
                const durationMs = scheduleEndDate - scheduleStartDate;
                const durationMinutes = Math.round(durationMs / (1000 * 60));
                streamData.duration = durationMinutes > 0 ? durationMinutes : null;
            }
        } else if (req.body.scheduleEndTime) {
            const scheduleEndDate = parseLocalDateTime(req.body.scheduleEndTime);
            streamData.end_time = scheduleEndDate.toISOString();
        }

        if (!streamData.status) {
            streamData.status = 'offline';
        }
        const stream = await Stream.create(streamData);
        res.json({ success: true, stream });
    } catch (error) {
        console.error('Error creating stream:', error);
        res.status(500).json({ success: false, error: 'Failed to create stream' });
    }
};

exports.createYouTubeStream = async (req, res) => {
    try {
        const user = await User.findById(req.session.userId);

        if (!user.youtube_client_id || !user.youtube_client_secret) {
            return res.status(400).json({
                success: false,
                error: 'YouTube API credentials not configured.'
            });
        }

        const { videoId, title, description, privacy, category, tags, loopVideo, scheduleStartTime, scheduleEndTime, repeat, ytChannelId } = req.body;

        let selectedChannel;
        if (ytChannelId) {
            selectedChannel = await YoutubeChannel.findById(ytChannelId);
            if (!selectedChannel || selectedChannel.user_id !== req.session.userId) {
                return res.status(400).json({ success: false, error: 'Invalid channel selected' });
            }
        } else {
            selectedChannel = await YoutubeChannel.findDefault(req.session.userId);
            if (!selectedChannel) {
                const channels = await YoutubeChannel.findAll(req.session.userId);
                selectedChannel = channels[0];
            }
        }

        if (!selectedChannel || !selectedChannel.access_token || !selectedChannel.refresh_token) {
            return res.status(400).json({
                success: false,
                error: 'YouTube account not connected. Please connect your YouTube account in Settings.'
            });
        }

        if (!videoId) {
            return res.status(400).json({ success: false, error: 'Video is required' });
        }

        if (!title) {
            return res.status(400).json({ success: false, error: 'Stream title is required' });
        }

        let localThumbnailPath = null;
        if (req.file) {
            try {
                const originalFilename = req.file.filename;
                const thumbFilename = `thumb-${path.parse(originalFilename).name}.jpg`;
                await generateImageThumbnail(req.file.path, thumbFilename);
                localThumbnailPath = `/uploads/thumbnails/${thumbFilename}`;
            } catch (thumbError) {
                console.log('Note: Could not process thumbnail:', thumbError.message);
            }
        }

        const streamData = {
            title: title,
            video_id: videoId,
            rtmp_url: '',
            stream_key: '',
            platform: 'YouTube',
            platform_icon: 'ti-brand-youtube',
            bitrate: 4000,
            resolution: '1920x1080',
            fps: 30,
            orientation: 'horizontal',
            loop_video: loopVideo === 'true' || loopVideo === true,
            use_advanced_settings: false,
            user_id: req.session.userId,
            youtube_broadcast_id: null,
            youtube_stream_id: null,
            youtube_description: description || '',
            youtube_privacy: privacy || 'unlisted',
            youtube_category: category || '22',
            youtube_tags: tags || '',
            youtube_thumbnail: localThumbnailPath,
            youtube_channel_id: selectedChannel.id,
            is_youtube_api: true
        };

        if (scheduleStartTime) {
            const [datePart, timePart] = scheduleStartTime.split('T');
            const [year, month, day] = datePart.split('-').map(Number);
            const [hours, minutes] = timePart.split(':').map(Number);
            const scheduleDate = new Date(year, month - 1, day, hours, minutes);
            streamData.schedule_time = scheduleDate.toISOString();
            streamData.status = 'scheduled';
        } else {
            streamData.status = 'offline';
        }

        if (scheduleEndTime) {
            const [datePart, timePart] = scheduleEndTime.split('T');
            const [year, month, day] = datePart.split('-').map(Number);
            const [hours, minutes] = timePart.split(':').map(Number);
            const endDate = new Date(year, month - 1, day, hours, minutes);
            streamData.end_time = endDate.toISOString();
        }

        const stream = await Stream.create(streamData);

        res.json({
            success: true,
            stream,
            message: 'Stream created. YouTube broadcast will be created when stream starts.'
        });
    } catch (error) {
        console.error('Error creating YouTube stream:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to create YouTube stream'
        });
    }
};

exports.getStream = async (req, res) => {
    try {
        const stream = await Stream.getStreamWithVideo(req.params.id);
        if (!stream) {
            return res.status(404).json({ success: false, error: 'Stream not found' });
        }
        if (stream.user_id !== req.session.userId) {
            return res.status(403).json({ success: false, error: 'Not authorized to access this stream' });
        }

        if (stream.youtube_broadcast_id) {
            try {
                const user = await User.findById(req.session.userId);
                if (user.youtube_access_token && user.youtube_client_id && user.youtube_client_secret) {
                    const clientSecret = decrypt(user.youtube_client_secret);
                    const accessToken = decrypt(user.youtube_access_token);
                    const refreshToken = decrypt(user.youtube_refresh_token);

                    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
                    const host = req.headers['x-forwarded-host'] || req.get('host');
                    const redirectUri = `${protocol}://${host}/auth/youtube/callback`;

                    const oauth2Client = getYouTubeOAuth2Client(user.youtube_client_id, clientSecret, redirectUri);
                    oauth2Client.setCredentials({
                        access_token: accessToken,
                        refresh_token: refreshToken
                    });

                    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

                    const videoResponse = await youtube.videos.list({
                        part: 'snippet',
                        id: stream.youtube_broadcast_id
                    });

                    if (videoResponse.data.items && videoResponse.data.items.length > 0) {
                        const thumbnails = videoResponse.data.items[0].snippet.thumbnails;
                        stream.youtube_thumbnail = thumbnails.maxres?.url || thumbnails.high?.url || thumbnails.medium?.url || thumbnails.default?.url;
                    }
                }
            } catch (ytError) {
                console.log('Note: Could not fetch YouTube thumbnail:', ytError.message);
            }
        }

        res.json({ success: true, stream });
    } catch (error) {
        console.error('Error fetching stream:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch stream' });
    }
};

exports.updateStream = async (req, res) => {
    try {
        const stream = await Stream.findById(req.params.id);
        if (!stream) {
            return res.status(404).json({ success: false, error: 'Stream not found' });
        }
        if (stream.user_id !== req.session.userId) {
            return res.status(403).json({ success: false, error: 'Not authorized to update this stream' });
        }
        const updateData = {};

        function parseScheduleDateTime(dateTimeString) {
            const [datePart, timePart] = dateTimeString.split('T');
            const [year, month, day] = datePart.split('-').map(Number);
            const [hours, minutes] = timePart.split(':').map(Number);
            return new Date(year, month - 1, day, hours, minutes);
        }

        if (req.body.streamMode === 'youtube') {
            if (req.body.title) updateData.title = req.body.title;
            if (req.body.videoId) updateData.video_id = req.body.videoId;
            if (req.body.description !== undefined) updateData.youtube_description = req.body.description;
            if (req.body.privacy) updateData.youtube_privacy = req.body.privacy;
            if (req.body.category) updateData.youtube_category = req.body.category;
            if (req.body.tags !== undefined) updateData.youtube_tags = req.body.tags;
            if (req.body.loopVideo !== undefined) {
                updateData.loop_video = req.body.loopVideo === 'true' || req.body.loopVideo === true;
            }

            if (req.body.scheduleStartTime) {
                const scheduleStartDate = parseScheduleDateTime(req.body.scheduleStartTime);
                updateData.schedule_time = scheduleStartDate.toISOString();
                updateData.status = 'scheduled';

                if (req.body.scheduleEndTime) {
                    const scheduleEndDate = parseScheduleDateTime(req.body.scheduleEndTime);
                    updateData.end_time = scheduleEndDate.toISOString();
                } else if ('scheduleEndTime' in req.body && !req.body.scheduleEndTime) {
                    updateData.end_time = null;
                }
            } else if ('scheduleStartTime' in req.body && !req.body.scheduleStartTime) {
                updateData.schedule_time = null;
                if ('scheduleEndTime' in req.body && !req.body.scheduleEndTime) {
                    updateData.end_time = null;
                } else if (req.body.scheduleEndTime) {
                    const scheduleEndDate = parseScheduleDateTime(req.body.scheduleEndTime);
                    updateData.end_time = scheduleEndDate.toISOString();
                }
            }

            if (req.file) {
                try {
                    const originalFilename = req.file.filename;
                    const thumbFilename = `thumb-${path.parse(originalFilename).name}.jpg`;
                    await generateImageThumbnail(req.file.path, thumbFilename);
                    updateData.youtube_thumbnail = `/uploads/thumbnails/${thumbFilename}`;
                } catch (thumbError) {
                    console.log('Note: Could not process thumbnail:', thumbError.message);
                }
            }

            if (stream.youtube_broadcast_id) {
                try {
                    const user = await User.findById(req.session.userId);
                    if (user.youtube_client_id && user.youtube_client_secret) {
                        let selectedChannel = await YoutubeChannel.findById(stream.youtube_channel_id);
                        if (!selectedChannel) {
                            selectedChannel = await YoutubeChannel.findDefault(req.session.userId);
                        }

                        if (selectedChannel && selectedChannel.access_token) {
                            const clientSecret = decrypt(user.youtube_client_secret);
                            const accessToken = decrypt(selectedChannel.access_token);
                            const refreshToken = decrypt(selectedChannel.refresh_token);

                            const protocol = req.headers['x-forwarded-proto'] || req.protocol;
                            const host = req.headers['x-forwarded-host'] || req.get('host');
                            const redirectUri = `${protocol}://${host}/auth/youtube/callback`;

                            const oauth2Client = getYouTubeOAuth2Client(user.youtube_client_id, clientSecret, redirectUri);
                            oauth2Client.setCredentials({
                                access_token: accessToken,
                                refresh_token: refreshToken
                            });

                            const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

                            const broadcastUpdateData = {
                                id: stream.youtube_broadcast_id,
                                snippet: {
                                    title: req.body.title || stream.title,
                                    description: req.body.description !== undefined ? req.body.description : (stream.youtube_description || ''),
                                    scheduledStartTime: req.body.scheduleStartTime
                                        ? new Date(req.body.scheduleStartTime).toISOString()
                                        : (stream.schedule_time || new Date().toISOString())
                                }
                            };

                            const privacyUpdateData = {
                                id: stream.youtube_broadcast_id,
                                status: {
                                    privacyStatus: req.body.privacy || stream.youtube_privacy || 'unlisted'
                                }
                            };

                            try {
                                await youtube.liveBroadcasts.update({
                                    part: 'snippet',
                                    requestBody: broadcastUpdateData
                                });
                            } catch (snippetError) {
                                console.log('Note: Could not update broadcast snippet:', snippetError.message);
                            }

                            try {
                                await youtube.liveBroadcasts.update({
                                    part: 'status',
                                    requestBody: privacyUpdateData
                                });
                            } catch (statusError) {
                                console.log('Note: Could not update broadcast status:', statusError.message);
                            }

                            const tagsArray = req.body.tags ? req.body.tags.split(',').map(t => t.trim()).filter(t => t) : [];
                            if (tagsArray.length > 0 || req.body.category) {
                                try {
                                    await youtube.videos.update({
                                        part: 'snippet',
                                        requestBody: {
                                            id: stream.youtube_broadcast_id,
                                            snippet: {
                                                title: req.body.title || stream.title,
                                                description: req.body.description !== undefined ? req.body.description : (stream.youtube_description || ''),
                                                categoryId: req.body.category || stream.youtube_category || '22',
                                                tags: tagsArray.length > 0 ? tagsArray : undefined
                                            }
                                        }
                                    });
                                } catch (videoUpdateError) {
                                    console.log('Note: Could not update video metadata:', videoUpdateError.message);
                                }
                            }

                            if (req.file && updateData.youtube_thumbnail) {
                                try {
                                    const thumbnailPath = path.join(__dirname, '..', 'public', updateData.youtube_thumbnail);
                                    if (fs.existsSync(thumbnailPath)) {
                                        const thumbnailStream = fs.createReadStream(thumbnailPath);
                                        await youtube.thumbnails.set({
                                            videoId: stream.youtube_broadcast_id,
                                            media: {
                                                mimeType: 'image/jpeg',
                                                body: thumbnailStream
                                            }
                                        });
                                    }
                                } catch (thumbError) {
                                    console.log('Note: Could not upload thumbnail to YouTube:', thumbError.message);
                                }
                            }
                        }
                    }
                } catch (youtubeError) {
                    console.log('Note: Could not update YouTube metadata:', youtubeError.message);
                }
            }

            await Stream.update(req.params.id, updateData);
            return res.json({ success: true, message: 'Stream updated successfully' });
        }

        if (req.body.streamTitle) updateData.title = req.body.streamTitle;
        if (req.body.videoId) updateData.video_id = req.body.videoId;

        if (req.body.rtmpUrl) {
            updateData.rtmp_url = req.body.rtmpUrl;

            let platform = 'Custom';
            let platform_icon = 'ti-broadcast';
            if (req.body.rtmpUrl.includes('youtube.com')) {
                platform = 'YouTube';
                platform_icon = 'ti-brand-youtube';
            } else if (req.body.rtmpUrl.includes('facebook.com')) {
                platform = 'Facebook';
                platform_icon = 'ti-brand-facebook';
            } else if (req.body.rtmpUrl.includes('twitch.tv')) {
                platform = 'Twitch';
                platform_icon = 'ti-brand-twitch';
            } else if (req.body.rtmpUrl.includes('tiktok.com')) {
                platform = 'TikTok';
                platform_icon = 'ti-brand-tiktok';
            } else if (req.body.rtmpUrl.includes('instagram.com')) {
                platform = 'Instagram';
                platform_icon = 'ti-brand-instagram';
            } else if (req.body.rtmpUrl.includes('shopee.io')) {
                platform = 'Shopee Live';
                platform_icon = 'ti-brand-shopee';
            } else if (req.body.rtmpUrl.includes('restream.io')) {
                platform = 'Restream.io';
                platform_icon = 'ti-live-photo';
            }
            updateData.platform = platform;
            updateData.platform_icon = platform_icon;
        }

        if (req.body.streamKey) updateData.stream_key = req.body.streamKey;
        if (req.body.bitrate) updateData.bitrate = parseInt(req.body.bitrate);
        if (req.body.resolution) updateData.resolution = req.body.resolution;
        if (req.body.fps) updateData.fps = parseInt(req.body.fps);
        if (req.body.orientation) updateData.orientation = req.body.orientation;
        if (req.body.loopVideo !== undefined) {
            updateData.loop_video = req.body.loopVideo === 'true' || req.body.loopVideo === true;
        }
        if (req.body.useAdvancedSettings !== undefined) {
            updateData.use_advanced_settings = req.body.useAdvancedSettings === 'true' || req.body.useAdvancedSettings === true;
        }

        if (req.body.scheduleStartTime) {
            const scheduleStartDate = parseScheduleDateTime(req.body.scheduleStartTime);
            updateData.schedule_time = scheduleStartDate.toISOString();
            updateData.status = 'scheduled';

            if (req.body.scheduleEndTime) {
                const scheduleEndDate = parseScheduleDateTime(req.body.scheduleEndTime);

                if (scheduleEndDate <= scheduleStartDate) {
                    return res.status(400).json({
                        success: false,
                        error: 'End time must be after start time'
                    });
                }

                updateData.end_time = scheduleEndDate.toISOString();
                const durationMs = scheduleEndDate - scheduleStartDate;
                const durationMinutes = Math.round(durationMs / (1000 * 60));
                updateData.duration = durationMinutes > 0 ? durationMinutes : null;
            } else if ('scheduleEndTime' in req.body && req.body.scheduleEndTime === '') {
                updateData.end_time = null;
                updateData.duration = null;
            }
        } else if ('scheduleStartTime' in req.body && !req.body.scheduleStartTime) {
            updateData.schedule_time = null;
            updateData.status = 'offline';

            if (req.body.scheduleEndTime) {
                const scheduleEndDate = parseScheduleDateTime(req.body.scheduleEndTime);
                updateData.end_time = scheduleEndDate.toISOString();
            } else if ('scheduleEndTime' in req.body && req.body.scheduleEndTime === '') {
                updateData.end_time = null;
                updateData.duration = null;
            }
        } else if (req.body.scheduleEndTime) {
            const scheduleEndDate = parseScheduleDateTime(req.body.scheduleEndTime);
            updateData.end_time = scheduleEndDate.toISOString();
        } else if ('scheduleEndTime' in req.body && req.body.scheduleEndTime === '') {
            updateData.end_time = null;
            updateData.duration = null;
        }

        const updatedStream = await Stream.update(req.params.id, updateData);
        res.json({ success: true, stream: updatedStream });
    } catch (error) {
        console.error('Error updating stream:', error);
        res.status(500).json({ success: false, error: 'Failed to update stream' });
    }
};

exports.deleteStream = async (req, res) => {
    try {
        const stream = await Stream.findById(req.params.id);
        if (!stream) {
            return res.status(404).json({ success: false, error: 'Stream not found' });
        }
        if (stream.user_id !== req.session.userId) {
            return res.status(403).json({ success: false, error: 'Not authorized to delete this stream' });
        }
        await Stream.delete(req.params.id, req.session.userId);
        res.json({ success: true, message: 'Stream deleted successfully' });
    } catch (error) {
        console.error('Error deleting stream:', error);
        res.status(500).json({ success: false, error: 'Failed to delete stream' });
    }
};

exports.updateStreamStatus = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, error: errors.array()[0].msg });
        }
        const streamId = req.params.id;
        const stream = await Stream.findById(streamId);
        if (!stream) {
            return res.status(404).json({ success: false, error: 'Stream not found' });
        }
        if (stream.user_id !== req.session.userId) {
            return res.status(403).json({ success: false, error: 'Not authorized' });
        }
        const newStatus = req.body.status;
        if (newStatus === 'live') {
            if (stream.status === 'live') {
                return res.json({
                    success: false,
                    error: 'Stream is already live',
                    stream
                });
            }
            if (!stream.video_id) {
                return res.json({
                    success: false,
                    error: 'No video attached to this stream',
                    stream
                });
            }
            const protocol = req.headers['x-forwarded-proto'] || req.protocol;
            const host = req.headers['x-forwarded-host'] || req.get('host');
            const baseUrl = `${protocol}://${host}`;
            const result = await streamingService.startStream(streamId, false, baseUrl);
            if (result.success) {
                const updatedStream = await Stream.getStreamWithVideo(streamId);
                return res.json({
                    success: true,
                    stream: updatedStream,
                    isAdvancedMode: result.isAdvancedMode
                });
            } else {
                return res.status(500).json({
                    success: false,
                    error: result.error || 'Failed to start stream'
                });
            }
        } else if (newStatus === 'offline') {
            if (stream.status === 'live') {
                const result = await streamingService.stopStream(streamId);
                if (!result.success) {
                    console.warn('Failed to stop FFmpeg process:', result.error);
                }
            } else if (stream.status === 'scheduled') {
                await Stream.update(streamId, {
                    schedule_time: null,
                    end_time: null,
                    status: 'offline'
                });
            }
            const result = await Stream.updateStatus(streamId, 'offline', req.session.userId);
            if (!result.updated) {
                return res.status(404).json({
                    success: false,
                    error: 'Stream not found or not updated'
                });
            }
            return res.json({ success: true, stream: result });
        } else {
            const result = await Stream.updateStatus(streamId, newStatus, req.session.userId);
            if (!result.updated) {
                return res.status(404).json({
                    success: false,
                    error: 'Stream not found or not updated'
                });
            }
            return res.json({ success: true, stream: result });
        }
    } catch (error) {
        console.error('Error updating stream status:', error);
        res.status(500).json({ success: false, error: 'Failed to update stream status' });
    }
};

exports.checkStreamKey = async (req, res) => {
    try {
        const streamKey = req.query.key;
        const excludeId = req.query.excludeId || null;
        if (!streamKey) {
            return res.status(400).json({
                success: false,
                error: 'Stream key is required'
            });
        }
        const isInUse = await Stream.isStreamKeyInUse(streamKey, req.session.userId, excludeId);
        res.json({
            success: true,
            isInUse: isInUse,
            message: isInUse ? 'Stream key is already in use' : 'Stream key is available'
        });
    } catch (error) {
        console.error('Error checking stream key:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to check stream key'
        });
    }
};

exports.getStreamLogs = async (req, res) => {
    try {
        const streamId = req.params.id;
        const stream = await Stream.findById(streamId);
        if (!stream) {
            return res.status(404).json({ success: false, error: 'Stream not found' });
        }
        if (stream.user_id !== req.session.userId) {
            return res.status(403).json({ success: false, error: 'Not authorized' });
        }
        const logs = streamingService.getStreamLogs(streamId);
        const isActive = streamingService.isStreamActive(streamId);
        res.json({
            success: true,
            logs,
            isActive,
            stream
        });
    } catch (error) {
        console.error('Error fetching stream logs:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch stream logs' });
    }
};
