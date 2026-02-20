const User = require('../models/User');
const Video = require('../models/Video');
const Stream = require('../models/Stream');
const Playlist = require('../models/Playlist');
const path = require('path');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const { v4: uuidv4 } = require('uuid');
const audioConverter = require('../services/audioConverter');
const chunkUploadService = require('../services/chunkUploadService');
const { getVideoInfo, generateThumbnail } = require('../utils/videoProcessor');
const AppSettings = require('../models/AppSettings');

// In-memory storage for import jobs
const importJobs = {};

exports.getGallery = async (req, res) => {
    try {
        const videos = await Video.findAll(req.session.userId);
        res.render('gallery', {
            title: 'Video Gallery',
            active: 'gallery',
            user: await User.findById(req.session.userId),
            videos: videos
        });
    } catch (error) {
        console.error('Gallery error:', error);
        res.redirect('/dashboard');
    }
};

exports.getHistory = async (req, res) => {
    try {
        const db = require('../db/database').db;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const sort = req.query.sort === 'oldest' ? 'ASC' : 'DESC';
        const platform = req.query.platform || 'all';
        const search = req.query.search || '';
        const offset = (page - 1) * limit;

        let whereClause = 'WHERE h.user_id = ?';
        const params = [req.session.userId];

        if (platform !== 'all') {
            whereClause += ' AND h.platform = ?';
            params.push(platform);
        }

        if (search) {
            whereClause += ' AND h.title LIKE ?';
            params.push(`%${search}%`);
        }

        const totalCount = await new Promise((resolve, reject) => {
            db.get(
                `SELECT COUNT(*) as count FROM stream_history h ${whereClause}`,
                params,
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row.count);
                }
            );
        });

        const history = await new Promise((resolve, reject) => {
            db.all(
                `SELECT h.*, v.thumbnail_path 
         FROM stream_history h 
         LEFT JOIN videos v ON h.video_id = v.id 
         ${whereClause}
         ORDER BY h.start_time ${sort}
         LIMIT ? OFFSET ?`,
                [...params, limit, offset],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        const totalPages = Math.ceil(totalCount / limit);

        res.render('history', {
            active: 'history',
            title: 'Stream History',
            history: history,
            helpers: req.app.locals.helpers,
            pagination: {
                page,
                limit,
                totalCount,
                totalPages,
                sort: req.query.sort || 'newest',
                platform,
                search
            }
        });
    } catch (error) {
        console.error('Error fetching stream history:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Failed to load stream history',
            error: error
        });
    }
};

exports.deleteHistoryItem = async (req, res) => {
    try {
        const db = require('../db/database').db;
        const historyId = req.params.id;
        const history = await new Promise((resolve, reject) => {
            db.get(
                'SELECT * FROM stream_history WHERE id = ? AND user_id = ?',
                [historyId, req.session.userId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
        if (!history) {
            return res.status(404).json({
                success: false,
                error: 'History entry not found or not authorized'
            });
        }
        await new Promise((resolve, reject) => {
            db.run(
                'DELETE FROM stream_history WHERE id = ?',
                [historyId],
                function (err) {
                    if (err) reject(err);
                    else resolve(this);
                }
            );
        });
        res.json({ success: true, message: 'History entry deleted' });
    } catch (error) {
        console.error('Error deleting history entry:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete history entry'
        });
    }
};

exports.uploadVideo = async (req, res) => {
    try {
        console.log('Upload request received:', req.file);
        console.log('Session userId for upload:', req.session.userId);

        if (!req.file) {
            return res.status(400).json({ error: 'No video file provided' });
        }
        const { filename, originalname, path: videoPath, mimetype, size } = req.file;
        const thumbnailName = path.basename(filename, path.extname(filename)) + '.jpg';
        const videoInfo = await getVideoInfo(videoPath);
        const thumbnailRelativePath = await generateThumbnail(videoPath, thumbnailName)
            .then(() => `/uploads/thumbnails/${thumbnailName}`)
            .catch(() => null);
        let format = 'unknown';
        if (mimetype === 'video/mp4') format = 'mp4';
        else if (mimetype === 'video/avi') format = 'avi';
        else if (mimetype === 'video/quicktime') format = 'mov';
        const videoData = {
            title: path.basename(originalname, path.extname(originalname)),
            original_filename: originalname,
            filepath: `/uploads/videos/${filename}`,
            thumbnail_path: thumbnailRelativePath,
            file_size: size,
            duration: videoInfo.duration,
            format: format,
            user_id: req.session.userId
        };
        const video = await Video.create(videoData);
        res.json({
            success: true,
            video: {
                id: video.id,
                title: video.title,
                filepath: video.filepath,
                thumbnail_path: video.thumbnail_path,
                duration: video.duration,
                file_size: video.file_size,
                format: video.format
            }
        });
    } catch (error) {
        console.error('Upload error details:', error);
        res.status(500).json({
            error: 'Failed to upload video',
            details: error.message
        });
    }
};

exports.apiUploadVideo = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No video file provided'
            });
        }

        const user = await User.findById(req.session.userId);
        if (user.disk_limit > 0) {
            const currentUsage = await User.getDiskUsage(req.session.userId);
            const newTotal = currentUsage + req.file.size;
            if (newTotal > user.disk_limit) {
                const fullFilePath = path.join(__dirname, '..', 'public', 'uploads', 'videos', req.file.filename);
                if (fs.existsSync(fullFilePath)) {
                    fs.unlinkSync(fullFilePath);
                }
                return res.status(400).json({
                    success: false,
                    error: 'Disk limit exceeded. Please delete some files or contact admin.'
                });
            }
        }

        let title = path.parse(req.file.originalname).name;
        const filePath = `/uploads/videos/${req.file.filename}`;
        const fullFilePath = path.join(__dirname, '..', 'public', filePath);
        const fileSize = req.file.size;
        await new Promise((resolve, reject) => {
            ffmpeg.ffprobe(fullFilePath, (err, metadata) => {
                if (err) {
                    console.error('Error extracting metadata:', err);
                    return reject(err);
                }
                const videoStream = metadata.streams.find(stream => stream.codec_type === 'video');
                const duration = metadata.format.duration || 0;
                const format = metadata.format.format_name || '';
                const resolution = videoStream ? `${videoStream.width}x${videoStream.height}` : '';
                const bitrate = metadata.format.bit_rate ?
                    Math.round(parseInt(metadata.format.bit_rate) / 1000) :
                    null;
                let fps = null;
                if (videoStream && videoStream.avg_frame_rate) {
                    const fpsRatio = videoStream.avg_frame_rate.split('/');
                    if (fpsRatio.length === 2 && parseInt(fpsRatio[1]) !== 0) {
                        fps = Math.round((parseInt(fpsRatio[0]) / parseInt(fpsRatio[1]) * 100)) / 100;
                    } else {
                        fps = parseInt(fpsRatio[0]) || null;
                    }
                }
                const thumbnailFilename = `thumb-${path.parse(req.file.filename).name}.jpg`;
                const thumbnailPath = `/uploads/thumbnails/${thumbnailFilename}`;
                // const fullThumbnailPath = path.join(__dirname, '..', 'public', thumbnailPath); // Unused in original, but good to know path logic
                ffmpeg(fullFilePath)
                    .screenshots({
                        timestamps: ['10%'],
                        filename: thumbnailFilename,
                        folder: path.join(__dirname, '..', 'public', 'uploads', 'thumbnails'),
                        size: '854x480'
                    })
                    .on('end', async () => {
                        try {
                            const videoData = {
                                title,
                                filepath: filePath,
                                thumbnail_path: thumbnailPath,
                                file_size: fileSize,
                                duration,
                                format,
                                resolution,
                                bitrate,
                                fps,
                                user_id: req.session.userId
                            };
                            const video = await Video.create(videoData);
                            res.json({
                                success: true,
                                message: 'Video uploaded successfully',
                                video
                            });
                            resolve();
                        } catch (dbError) {
                            console.error('Database error:', dbError);
                            reject(dbError);
                        }
                    })
                    .on('error', (err) => {
                        console.error('Error creating thumbnail:', err);
                        reject(err);
                    });
            });
        });
    } catch (error) {
        console.error('Upload error details:', error);
        res.status(500).json({
            error: 'Failed to upload video',
            details: error.message
        });
    }
};

exports.getVideos = async (req, res) => {
    try {
        const allVideos = await Video.findAll(req.session.userId);
        const videos = allVideos.filter(video => {
            const filepath = (video.filepath || '').toLowerCase();
            if (filepath.includes('/audio/')) return false;
            if (filepath.endsWith('.m4a') || filepath.endsWith('.aac') || filepath.endsWith('.mp3')) return false;
            return true;
        });
        const playlists = await Playlist.findAll(req.session.userId);
        res.json({ success: true, videos, playlists });
    } catch (error) {
        console.error('Error fetching videos:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch videos' });
    }
};

exports.uploadAudio = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No audio file provided'
            });
        }

        const user = await User.findById(req.session.userId);
        if (user.disk_limit > 0) {
            const currentUsage = await User.getDiskUsage(req.session.userId);
            const newTotal = currentUsage + req.file.size;
            if (newTotal > user.disk_limit) {
                const uploadedPath = path.join(__dirname, '..', 'public', 'uploads', 'audio', req.file.filename);
                if (fs.existsSync(uploadedPath)) {
                    fs.unlinkSync(uploadedPath);
                }
                return res.status(400).json({
                    success: false,
                    error: 'Disk limit exceeded. Please delete some files or contact admin.'
                });
            }
        }

        let title = path.parse(req.file.originalname).name;
        const uploadedPath = path.join(__dirname, '..', 'public', 'uploads', 'audio', req.file.filename);
        const result = await audioConverter.processAudioFile(uploadedPath, req.file.originalname);
        const finalFilename = path.basename(result.filepath);
        const filePath = `/uploads/audio/${finalFilename}`;
        const fullFilePath = result.filepath;
        const audioInfo = await audioConverter.getAudioInfo(fullFilePath);
        const stats = fs.statSync(fullFilePath);
        const thumbnailPath = '/images/audio-thumbnail.png';
        const videoData = {
            title,
            filepath: filePath,
            thumbnail_path: thumbnailPath,
            file_size: stats.size,
            duration: audioInfo.duration,
            format: 'aac',
            resolution: null,
            bitrate: audioInfo.bitrate,
            fps: null,
            user_id: req.session.userId
        };
        const video = await Video.create(videoData);
        res.json({
            success: true,
            message: result.converted ? 'Audio converted to AAC and uploaded successfully' : 'Audio uploaded successfully',
            video,
            converted: result.converted
        });
    } catch (error) {
        console.error('Audio upload error:', error);
        res.status(500).json({
            error: 'Failed to upload audio',
            details: error.message
        });
    }
};

exports.initChunkUpload = async (req, res) => {
    try {
        const { filename, fileSize, totalChunks } = req.body;
        if (!filename || !fileSize || !totalChunks) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }
        const allowedExts = ['.mp4', '.avi', '.mov'];
        const ext = path.extname(filename).toLowerCase();
        if (!allowedExts.includes(ext)) {
            return res.status(400).json({ success: false, error: 'Only .mp4, .avi, and .mov formats are allowed' });
        }

        const user = await User.findById(req.session.userId);
        if (user.disk_limit > 0) {
            const currentUsage = await User.getDiskUsage(req.session.userId);
            const newTotal = currentUsage + parseInt(fileSize);
            if (newTotal > user.disk_limit) {
                return res.status(400).json({
                    success: false,
                    error: 'Disk limit exceeded. Please delete some files or contact admin.'
                });
            }
        }

        const info = await chunkUploadService.initUpload(filename, fileSize, totalChunks, req.session.userId);
        res.json({
            success: true,
            uploadId: info.uploadId,
            chunkSize: chunkUploadService.CHUNK_SIZE,
            uploadedChunks: info.uploadedChunks || [],
            resumed: (info.uploadedChunks || []).length > 0
        });
    } catch (error) {
        console.error('Chunk init error:', error);
        res.status(500).json({ success: false, error: 'Failed to initialize upload' });
    }
};

exports.uploadChunk = async (req, res) => {
    try {
        const uploadId = req.headers['x-upload-id'];
        const chunkIndex = parseInt(req.headers['x-chunk-index'], 10);
        if (!uploadId || isNaN(chunkIndex)) {
            return res.status(400).json({ success: false, error: 'Missing upload ID or chunk index' });
        }
        const info = await chunkUploadService.getUploadInfo(uploadId);
        if (!info) {
            return res.status(404).json({ success: false, error: 'Upload session not found' });
        }
        if (info.userId !== req.session.userId) {
            return res.status(403).json({ success: false, error: 'Not authorized' });
        }
        const result = await chunkUploadService.saveChunk(uploadId, chunkIndex, req.body);
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('Chunk upload error:', error);
        res.status(500).json({ success: false, error: 'Failed to upload chunk' });
    }
};

exports.getChunkStatus = async (req, res) => {
    try {
        const info = await chunkUploadService.getUploadInfo(req.params.uploadId);
        if (!info) {
            return res.status(404).json({ success: false, error: 'Upload session not found' });
        }
        if (info.userId !== req.session.userId) {
            return res.status(403).json({ success: false, error: 'Not authorized' });
        }
        res.json({
            success: true,
            uploadedChunks: info.uploadedChunks,
            totalChunks: info.totalChunks,
            status: info.status
        });
    } catch (error) {
        console.error('Chunk status error:', error);
        res.status(500).json({ success: false, error: 'Failed to get upload status' });
    }
};

exports.completeChunkUpload = async (req, res) => {
    try {
        const { uploadId } = req.body;
        if (!uploadId) {
            return res.status(400).json({ success: false, error: 'Missing upload ID' });
        }
        const info = await chunkUploadService.getUploadInfo(uploadId);
        if (!info) {
            return res.status(404).json({ success: false, error: 'Upload session not found' });
        }
        if (info.userId !== req.session.userId) {
            return res.status(403).json({ success: false, error: 'Not authorized' });
        }
        const result = await chunkUploadService.mergeChunks(uploadId);
        const title = path.parse(info.filename).name;
        const fullFilePath = result.fullPath;
        const videoData = await new Promise((resolve, reject) => {
            ffmpeg.ffprobe(fullFilePath, (err, metadata) => {
                if (err) {
                    console.error('Error extracting metadata:', err);
                    return reject(err);
                }
                const videoStream = metadata.streams.find(stream => stream.codec_type === 'video');
                const duration = metadata.format.duration || 0;
                const format = metadata.format.format_name || '';
                const resolution = videoStream ? `${videoStream.width}x${videoStream.height}` : '';
                const bitrate = metadata.format.bit_rate ? Math.round(parseInt(metadata.format.bit_rate) / 1000) : null;
                let fps = null;
                if (videoStream && videoStream.avg_frame_rate) {
                    const fpsRatio = videoStream.avg_frame_rate.split('/');
                    if (fpsRatio.length === 2 && parseInt(fpsRatio[1]) !== 0) {
                        fps = Math.round((parseInt(fpsRatio[0]) / parseInt(fpsRatio[1]) * 100)) / 100;
                    } else {
                        fps = parseInt(fpsRatio[0]) || null;
                    }
                }
                const thumbnailFilename = `thumb-${path.parse(result.filename).name}.jpg`;
                const thumbnailPath = `/uploads/thumbnails/${thumbnailFilename}`;
                ffmpeg(fullFilePath)
                    .screenshots({
                        timestamps: ['10%'],
                        filename: thumbnailFilename,
                        folder: path.join(__dirname, '..', 'public', 'uploads', 'thumbnails'),
                        size: '854x480'
                    })
                    .on('end', async () => {
                        resolve({
                            title,
                            filepath: result.filepath,
                            thumbnail_path: thumbnailPath,
                            file_size: result.fileSize,
                            duration,
                            format,
                            resolution,
                            bitrate,
                            fps,
                            user_id: req.session.userId
                        });
                    })
                    .on('error', (err) => {
                        console.error('Error creating thumbnail:', err);
                        reject(err);
                    });
            });
        });
        const video = await Video.create(videoData);
        await chunkUploadService.cleanupUpload(uploadId);
        res.json({ success: true, message: 'Video uploaded successfully', video });
    } catch (error) {
        console.error('Chunk complete error:', error);
        res.status(500).json({ success: false, error: 'Failed to complete upload', details: error.message });
    }
};

exports.pauseChunkUpload = async (req, res) => {
    try {
        const { uploadId } = req.body;
        if (!uploadId) {
            return res.status(400).json({ success: false, error: 'Missing upload ID' });
        }
        const info = await chunkUploadService.getUploadInfo(uploadId);
        if (!info) {
            return res.status(404).json({ success: false, error: 'Upload session not found' });
        }
        if (info.userId !== req.session.userId) {
            return res.status(403).json({ success: false, error: 'Not authorized' });
        }
        await chunkUploadService.pauseUpload(uploadId);
        res.json({ success: true });
    } catch (error) {
        console.error('Chunk pause error:', error);
        res.status(500).json({ success: false, error: 'Failed to pause upload' });
    }
};

exports.deleteChunkUpload = async (req, res) => {
    try {
        const info = await chunkUploadService.getUploadInfo(req.params.uploadId);
        if (info && info.userId === req.session.userId) {
            await chunkUploadService.cleanupUpload(req.params.uploadId);
        }
        res.json({ success: true });
    } catch (error) {
        console.error('Chunk cleanup error:', error);
        res.status(500).json({ success: false, error: 'Failed to cleanup upload' });
    }
};

exports.deleteVideo = async (req, res) => {
    try {
        const videoId = req.params.id;
        const video = await Video.findById(videoId);
        if (!video) {
            return res.status(404).json({ success: false, error: 'Video not found' });
        }
        if (video.user_id !== req.session.userId) {
            return res.status(403).json({ success: false, error: 'Not authorized' });
        }
        const videoPath = path.join(__dirname, '..', 'public', video.filepath);
        if (fs.existsSync(videoPath)) {
            fs.unlinkSync(videoPath);
        }
        if (video.thumbnail_path) {
            const thumbnailPath = path.join(__dirname, '..', 'public', video.thumbnail_path);
            if (fs.existsSync(thumbnailPath)) {
                fs.unlinkSync(thumbnailPath);
            }
        }
        await Video.delete(videoId, req.session.userId);
        res.json({ success: true, message: 'Video deleted successfully' });
    } catch (error) {
        console.error('Error deleting video:', error);
        res.status(500).json({ success: false, error: 'Failed to delete video' });
    }
};

exports.renameVideo = async (req, res) => {
    try {
        const video = await Video.findById(req.params.id);
        if (!video) {
            return res.status(404).json({ error: 'Video not found' });
        }
        if (video.user_id !== req.session.userId) {
            return res.status(403).json({ error: 'You don\'t have permission to rename this video' });
        }
        await Video.update(req.params.id, { title: req.body.title });
        res.json({ success: true, message: 'Video renamed successfully' });
    } catch (error) {
        console.error('Error renaming video:', error);
        res.status(500).json({ error: 'Failed to rename video' });
    }
};

exports.streamVideo = async (req, res) => {
    try {
        const videoId = req.params.videoId;
        const video = await Video.findById(videoId);
        if (!video) {
            return res.status(404).send('Video not found');
        }
        // Access control: only owner? Original logic checks userId
        if (video.user_id !== req.session.userId) {
            return res.status(403).send('You do not have permission to access this video');
        }
        const videoPath = path.join(__dirname, '..', 'public', video.filepath);
        const stat = fs.statSync(videoPath);
        const fileSize = stat.size;
        const range = req.headers.range;
        res.setHeader('Content-Disposition', 'inline');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Cache-Control', 'no-store');
        if (range) {
            const parts = range.replace(/bytes=/, '').split('-');
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunkSize = (end - start) + 1;
            const file = fs.createReadStream(videoPath, { start, end });
            res.writeHead(206, {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunkSize,
                'Content-Type': 'video/mp4',
            });
            file.pipe(res);
        } else {
            res.writeHead(200, {
                'Content-Length': fileSize,
                'Content-Type': 'video/mp4',
            });
            fs.createReadStream(videoPath).pipe(res);
        }
    } catch (error) {
        console.error('Streaming error:', error);
        res.status(500).send('Error streaming video');
    }
};

// Import Functions
exports.importFromDrive = async (req, res) => {
    try {
        const { driveUrl } = req.body;
        const { extractFileId } = require('../utils/googleDriveService');
        try {
            const fileId = extractFileId(driveUrl);
            const jobId = uuidv4();
            processGoogleDriveImport(jobId, fileId, req.session.userId)
                .catch(err => console.error('Drive import failed:', err));
            return res.json({
                success: true,
                message: 'Video import started',
                jobId: jobId
            });
        } catch (error) {
            console.error('Google Drive URL parsing error:', error);
            return res.status(400).json({
                success: false,
                error: 'Invalid Google Drive URL format'
            });
        }
    } catch (error) {
        console.error('Error importing from Google Drive:', error);
        res.status(500).json({ success: false, error: 'Failed to import video' });
    }
};

exports.getImportStatus = async (req, res) => {
    const jobId = req.params.jobId;
    if (!importJobs[jobId]) {
        return res.status(404).json({ success: false, error: 'Import job not found' });
    }
    return res.json({
        success: true,
        status: importJobs[jobId]
    });
};

exports.importFromMediafire = async (req, res) => {
    try {
        const { mediafireUrl } = req.body;
        const { extractFileKey } = require('../utils/mediafireService');
        try {
            const fileKey = extractFileKey(mediafireUrl);
            const jobId = uuidv4();
            processMediafireImport(jobId, fileKey, req.session.userId)
                .catch(err => console.error('Mediafire import failed:', err));
            return res.json({
                success: true,
                message: 'Video import started',
                jobId: jobId
            });
        } catch (error) {
            console.error('Mediafire URL parsing error:', error);
            return res.status(400).json({
                success: false,
                error: 'Invalid Mediafire URL format'
            });
        }
    } catch (error) {
        console.error('Error importing from Mediafire:', error);
        res.status(500).json({ success: false, error: 'Failed to import video' });
    }
};

exports.importFromDropbox = async (req, res) => {
    try {
        const { dropboxUrl } = req.body;
        if (!dropboxUrl.includes('dropbox.com')) {
            return res.status(400).json({
                success: false,
                error: 'Invalid Dropbox URL format'
            });
        }
        const jobId = uuidv4();
        processDropboxImport(jobId, dropboxUrl, req.session.userId)
            .catch(err => console.error('Dropbox import failed:', err));
        return res.json({
            success: true,
            message: 'Video import started',
            jobId: jobId
        });
    } catch (error) {
        console.error('Error importing from Dropbox:', error);
        res.status(500).json({ success: false, error: 'Failed to import video' });
    }
};

exports.importFromMega = async (req, res) => {
    try {
        const { megaUrl } = req.body;
        if (!megaUrl.includes('mega.nz') && !megaUrl.includes('mega.co.nz')) {
            return res.status(400).json({
                success: false,
                error: 'Invalid MEGA URL format'
            });
        }
        const jobId = uuidv4();
        processMegaImport(jobId, megaUrl, req.session.userId)
            .catch(err => console.error('MEGA import failed:', err));
        return res.json({
            success: true,
            message: 'Video import started',
            jobId: jobId
        });
    } catch (error) {
        console.error('Error importing from MEGA:', error);
        res.status(500).json({ success: false, error: 'Failed to import video' });
    }
};

// Helper Functions for Imports
async function processGoogleDriveImport(jobId, fileId, userId) {
    const { downloadFile } = require('../utils/googleDriveService');

    importJobs[jobId] = {
        status: 'downloading',
        progress: 0,
        message: 'Starting download...'
    };

    try {
        let result;
        try {
            result = await downloadFile(fileId, (progress) => {
                importJobs[jobId] = {
                    status: 'downloading',
                    progress: progress.progress,
                    message: `Downloading ${progress.filename}: ${progress.progress}%`
                };
            });
        } catch (downloadError) {
            importJobs[jobId] = {
                status: 'failed',
                progress: 0,
                message: downloadError.message || 'Failed to download file'
            };
            setTimeout(() => { delete importJobs[jobId]; }, 5 * 60 * 1000);
            return;
        }

        if (!result || !result.localFilePath) {
            importJobs[jobId] = {
                status: 'failed',
                progress: 0,
                message: 'Download completed but file path is missing'
            };
            setTimeout(() => { delete importJobs[jobId]; }, 5 * 60 * 1000);
            return;
        }

        importJobs[jobId] = {
            status: 'processing',
            progress: 100,
            message: 'Processing video...'
        };

        let videoInfo;
        try {
            videoInfo = await getVideoInfo(result.localFilePath);
        } catch (infoError) {
            videoInfo = { duration: 0 };
        }

        let resolution = '';
        let bitrate = null;

        try {
            const metadata = await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('ffprobe timeout')), 30000);
                ffmpeg.ffprobe(result.localFilePath, (err, metadata) => {
                    clearTimeout(timeout);
                    if (err) return reject(err);
                    resolve(metadata);
                });
            });

            const videoStream = metadata.streams.find(stream => stream.codec_type === 'video');
            if (videoStream) {
                resolution = `${videoStream.width}x${videoStream.height}`;
            }

            if (metadata.format && metadata.format.bit_rate) {
                bitrate = Math.round(parseInt(metadata.format.bit_rate) / 1000);
            }
        } catch (probeError) {
            console.log('ffprobe error (non-fatal):', probeError.message);
        }

        const thumbnailBaseName = path.basename(result.filename, path.extname(result.filename));
        const thumbnailName = thumbnailBaseName + '.jpg';
        let thumbnailRelativePath = null;

        try {
            await generateThumbnail(result.localFilePath, thumbnailName);
            thumbnailRelativePath = `/uploads/thumbnails/${thumbnailName}`;
        } catch (thumbError) {
            console.log('Thumbnail generation failed (non-fatal):', thumbError.message);
        }

        let format = path.extname(result.filename).toLowerCase().replace('.', '');
        if (!format) format = 'mp4';

        const videoData = {
            title: path.basename(result.filename, path.extname(result.filename)),
            filepath: `/uploads/videos/${result.filename}`,
            thumbnail_path: thumbnailRelativePath,
            file_size: result.fileSize,
            duration: videoInfo.duration || 0,
            format: format,
            resolution: resolution,
            bitrate: bitrate,
            user_id: userId
        };

        const video = await Video.create(videoData);

        importJobs[jobId] = {
            status: 'complete',
            progress: 100,
            message: 'Video imported successfully',
            videoId: video.id
        };
        setTimeout(() => {
            delete importJobs[jobId];
        }, 5 * 60 * 1000);
    } catch (error) {
        console.error('Error processing Google Drive import:', error.message);
        importJobs[jobId] = {
            status: 'failed',
            progress: 0,
            message: error.message || 'Failed to import video'
        };
        setTimeout(() => {
            delete importJobs[jobId];
        }, 5 * 60 * 1000);
    }
}

async function processMediafireImport(jobId, fileKey, userId) {
    const { downloadFile } = require('../utils/mediafireService');

    importJobs[jobId] = {
        status: 'downloading',
        progress: 0,
        message: 'Starting download...'
    };

    try {
        const result = await downloadFile(fileKey, (progress) => {
            importJobs[jobId] = {
                status: 'downloading',
                progress: progress.progress,
                message: `Downloading ${progress.filename}: ${progress.progress}%`
            };
        });

        importJobs[jobId] = {
            status: 'processing',
            progress: 100,
            message: 'Processing video...'
        };

        const videoInfo = await getVideoInfo(result.localFilePath);

        const metadata = await new Promise((resolve, reject) => {
            ffmpeg.ffprobe(result.localFilePath, (err, metadata) => {
                if (err) return reject(err);
                resolve(metadata);
            });
        });

        let resolution = '';
        let bitrate = null;

        const videoStream = metadata.streams.find(stream => stream.codec_type === 'video');
        if (videoStream) {
            resolution = `${videoStream.width}x${videoStream.height}`;
        }

        if (metadata.format && metadata.format.bit_rate) {
            bitrate = Math.round(parseInt(metadata.format.bit_rate) / 1000);
        }

        const thumbnailBaseName = path.basename(result.filename, path.extname(result.filename));
        const thumbnailName = thumbnailBaseName + '.jpg';
        const thumbnailRelativePath = await generateThumbnail(result.localFilePath, thumbnailName)
            .then(() => `/uploads/thumbnails/${thumbnailName}`)
            .catch(() => null);

        let format = path.extname(result.filename).toLowerCase().replace('.', '');
        if (!format) format = 'mp4';

        const videoData = {
            title: path.basename(result.filename, path.extname(result.filename)),
            filepath: `/uploads/videos/${result.filename}`,
            thumbnail_path: thumbnailRelativePath,
            file_size: result.fileSize,
            duration: videoInfo.duration,
            format: format,
            resolution: resolution,
            bitrate: bitrate,
            user_id: userId
        };

        const video = await Video.create(videoData);

        importJobs[jobId] = {
            status: 'complete',
            progress: 100,
            message: 'Video imported successfully',
            videoId: video.id
        };
        setTimeout(() => {
            delete importJobs[jobId];
        }, 5 * 60 * 1000);
    } catch (error) {
        console.error('Error processing Mediafire import:', error);
        importJobs[jobId] = {
            status: 'failed',
            progress: 0,
            message: error.message || 'Failed to import video'
        };
        setTimeout(() => {
            delete importJobs[jobId];
        }, 5 * 60 * 1000);
    }
}

async function processDropboxImport(jobId, dropboxUrl, userId) {
    const { downloadFile } = require('../utils/dropboxService');

    importJobs[jobId] = {
        status: 'downloading',
        progress: 0,
        message: 'Starting download...'
    };

    try {
        const result = await downloadFile(dropboxUrl, (progress) => {
            importJobs[jobId] = {
                status: 'downloading',
                progress: progress.progress,
                message: `Downloading ${progress.filename}: ${progress.progress}%`
            };
        });

        importJobs[jobId] = {
            status: 'processing',
            progress: 100,
            message: 'Processing video...'
        };

        const videoInfo = await getVideoInfo(result.localFilePath);

        const metadata = await new Promise((resolve, reject) => {
            ffmpeg.ffprobe(result.localFilePath, (err, metadata) => {
                if (err) return reject(err);
                resolve(metadata);
            });
        });

        let resolution = '';
        let bitrate = null;

        const videoStream = metadata.streams.find(stream => stream.codec_type === 'video');
        if (videoStream) {
            resolution = `${videoStream.width}x${videoStream.height}`;
        }

        if (metadata.format && metadata.format.bit_rate) {
            bitrate = Math.round(parseInt(metadata.format.bit_rate) / 1000);
        }

        const thumbnailBaseName = path.basename(result.filename, path.extname(result.filename));
        const thumbnailName = thumbnailBaseName + '.jpg';
        const thumbnailRelativePath = await generateThumbnail(result.localFilePath, thumbnailName)
            .then(() => `/uploads/thumbnails/${thumbnailName}`)
            .catch(() => null);

        let format = path.extname(result.filename).toLowerCase().replace('.', '');
        if (!format) format = 'mp4';

        const videoData = {
            title: path.basename(result.filename, path.extname(result.filename)),
            filepath: `/uploads/videos/${result.filename}`,
            thumbnail_path: thumbnailRelativePath,
            file_size: result.fileSize,
            duration: videoInfo.duration,
            format: format,
            resolution: resolution,
            bitrate: bitrate,
            user_id: userId
        };

        const video = await Video.create(videoData);

        importJobs[jobId] = {
            status: 'complete',
            progress: 100,
            message: 'Video imported successfully',
            videoId: video.id
        };
        setTimeout(() => {
            delete importJobs[jobId];
        }, 5 * 60 * 1000);
    } catch (error) {
        console.error('Error processing Dropbox import:', error);
        importJobs[jobId] = {
            status: 'failed',
            progress: 0,
            message: error.message || 'Failed to import video'
        };
        setTimeout(() => {
            delete importJobs[jobId];
        }, 5 * 60 * 1000);
    }
}

async function processMegaImport(jobId, megaUrl, userId) {
    const { downloadFile } = require('../utils/megaService');

    importJobs[jobId] = {
        status: 'downloading',
        progress: 0,
        message: 'Starting download...'
    };

    try {
        const result = await downloadFile(megaUrl, (progress) => {
            importJobs[jobId] = {
                status: 'downloading',
                progress: progress.progress,
                message: `Downloading ${progress.filename}: ${progress.progress}%`
            };
        });

        importJobs[jobId] = {
            status: 'processing',
            progress: 100,
            message: 'Processing video...'
        };

        const videoInfo = await getVideoInfo(result.localFilePath);

        const metadata = await new Promise((resolve, reject) => {
            ffmpeg.ffprobe(result.localFilePath, (err, metadata) => {
                if (err) return reject(err);
                resolve(metadata);
            });
        });

        let resolution = '';
        let bitrate = null;

        const videoStream = metadata.streams.find(stream => stream.codec_type === 'video');
        if (videoStream) {
            resolution = `${videoStream.width}x${videoStream.height}`;
        }

        if (metadata.format && metadata.format.bit_rate) {
            bitrate = Math.round(parseInt(metadata.format.bit_rate) / 1000);
        }

        const thumbnailBaseName = path.basename(result.filename, path.extname(result.filename));
        const thumbnailName = thumbnailBaseName + '.jpg';
        const thumbnailRelativePath = await generateThumbnail(result.localFilePath, thumbnailName)
            .then(() => `/uploads/thumbnails/${thumbnailName}`)
            .catch(() => null);

        let format = path.extname(result.filename).toLowerCase().replace('.', '');
        if (!format) format = 'mp4';

        const videoData = {
            title: path.basename(result.filename, path.extname(result.filename)),
            filepath: `/uploads/videos/${result.filename}`,
            thumbnail_path: thumbnailRelativePath,
            file_size: result.fileSize,
            duration: videoInfo.duration,
            format: format,
            resolution: resolution,
            bitrate: bitrate,
            user_id: userId
        };

        const video = await Video.create(videoData);

        importJobs[jobId] = {
            status: 'complete',
            progress: 100,
            message: 'Video imported successfully',
            videoId: video.id
        };
        setTimeout(() => {
            delete importJobs[jobId];
        }, 5 * 60 * 1000);
    } catch (error) {
        console.error('Error processing MEGA import:', error);
        importJobs[jobId] = {
            status: 'failed',
            progress: 0,
            message: error.message || 'Failed to import video'
        };
        setTimeout(() => {
            delete importJobs[jobId];
        }, 5 * 60 * 1000);
    }
}
