const User = require('../models/User');
const YoutubeChannel = require('../models/YoutubeChannel');
const AppSettings = require('../models/AppSettings');
const { encrypt, decrypt } = require('../utils/encryption');
const packageJson = require('../package.json');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const { validationResult } = require('express-validator');
const { google } = require('googleapis');

function getYouTubeOAuth2Client(clientId, clientSecret, redirectUri) {
    return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

exports.getSettings = async (req, res) => {
    try {
        const user = await User.findById(req.session.userId);
        if (!user) {
            req.session.destroy();
            return res.redirect('/login');
        }

        const hasYoutubeCredentials = !!(user.youtube_client_id && user.youtube_client_secret);
        const youtubeChannels = await YoutubeChannel.findAll(req.session.userId);
        const isYoutubeConnected = youtubeChannels.length > 0;
        const defaultChannel = youtubeChannels.find(c => c.is_default) || youtubeChannels[0];

        const recaptchaSettings = await AppSettings.getRecaptchaSettings();

        res.render('settings', {
            title: 'Settings',
            active: 'settings',
            user: user,
            appVersion: packageJson.version,
            youtubeClientId: user.youtube_client_id || '',
            youtubeClientSecret: user.youtube_client_secret ? '••••••••••••••••' : '',
            youtubeConnected: isYoutubeConnected,
            youtubeChannels: youtubeChannels,
            youtubeChannelName: defaultChannel?.channel_name || '',
            youtubeChannelThumbnail: defaultChannel?.channel_thumbnail || '',
            youtubeSubscriberCount: defaultChannel?.subscriber_count || '0',
            hasYoutubeCredentials: hasYoutubeCredentials,
            recaptchaSiteKey: recaptchaSettings.siteKey || '',
            recaptchaSecretKey: recaptchaSettings.secretKey ? '••••••••••••••••' : '',
            hasRecaptchaKeys: recaptchaSettings.hasKeys,
            recaptchaEnabled: recaptchaSettings.enabled,
            success: req.query.success || null,
            error: req.query.error || null,
            activeTab: req.query.activeTab || null
        });
    } catch (error) {
        console.error('Settings error:', error);
        res.redirect('/login');
    }
};

exports.updateProfile = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.render('settings', {
                title: 'Settings',
                active: 'settings',
                user: await User.findById(req.session.userId),
                error: errors.array()[0].msg,
                activeTab: 'profile'
            });
        }
        const currentUser = await User.findById(req.session.userId);
        if (req.body.username !== currentUser.username) {
            const existingUser = await User.findByUsername(req.body.username);
            if (existingUser) {
                return res.render('settings', {
                    title: 'Settings',
                    active: 'settings',
                    user: currentUser,
                    error: 'Username is already taken',
                    activeTab: 'profile'
                });
            }
        }
        const updateData = {
            username: req.body.username
        };
        if (req.file) {
            updateData.avatar_path = `/uploads/avatars/${req.file.filename}`;
        }
        await User.update(req.session.userId, updateData);
        req.session.username = updateData.username;
        if (updateData.avatar_path) {
            req.session.avatar_path = updateData.avatar_path;
        }
        return res.render('settings', {
            title: 'Settings',
            active: 'settings',
            user: await User.findById(req.session.userId),
            success: 'Profile updated successfully!',
            activeTab: 'profile'
        });
    } catch (error) {
        console.error('Error updating profile:', error);
        res.render('settings', {
            title: 'Settings',
            active: 'settings',
            user: await User.findById(req.session.userId),
            error: 'An error occurred while updating your profile',
            activeTab: 'profile'
        });
    }
};

exports.updatePassword = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.render('settings', {
                title: 'Settings',
                active: 'settings',
                user: await User.findById(req.session.userId),
                error: errors.array()[0].msg,
                activeTab: 'security'
            });
        }
        const user = await User.findById(req.session.userId);
        const passwordMatch = await User.verifyPassword(req.body.currentPassword, user.password);
        if (!passwordMatch) {
            return res.render('settings', {
                title: 'Settings',
                active: 'settings',
                user: user,
                error: 'Current password is incorrect',
                activeTab: 'security'
            });
        }
        const hashedPassword = await bcrypt.hash(req.body.newPassword, 10);
        await User.update(req.session.userId, { password: hashedPassword });
        return res.render('settings', {
            title: 'Settings',
            active: 'settings',
            user: await User.findById(req.session.userId),
            success: 'Password changed successfully',
            activeTab: 'security'
        });
    } catch (error) {
        console.error('Error changing password:', error);
        res.render('settings', {
            title: 'Settings',
            active: 'settings',
            user: await User.findById(req.session.userId),
            error: 'An error occurred while changing your password',
            activeTab: 'security'
        });
    }
};

exports.getLogs = async (req, res) => {
    try {
        const logPath = path.join(__dirname, '..', 'logs', 'app.log');
        const lines = parseInt(req.query.lines) || 200;
        const filter = req.query.filter || '';

        if (!fs.existsSync(logPath)) {
            return res.json({ success: true, logs: [], message: 'Log file not found' });
        }

        const stats = fs.statSync(logPath);
        const fileSize = stats.size;

        const maxReadSize = 5 * 1024 * 1024;
        let content = '';

        if (fileSize > maxReadSize) {
            const fd = fs.openSync(logPath, 'r');
            const buffer = Buffer.alloc(maxReadSize);
            fs.readSync(fd, buffer, 0, maxReadSize, fileSize - maxReadSize);
            fs.closeSync(fd);
            content = buffer.toString('utf8');
            const firstNewline = content.indexOf('\n');
            if (firstNewline > 0) {
                content = content.substring(firstNewline + 1);
            }
        } else {
            content = fs.readFileSync(logPath, 'utf8');
        }

        let logLines = content.split('\n').filter(line => line.trim());

        if (filter) {
            const filterLower = filter.toLowerCase();
            logLines = logLines.filter(line => line.toLowerCase().includes(filterLower));
        }

        logLines = logLines.slice(-lines);

        res.json({ success: true, logs: logLines });
    } catch (error) {
        console.error('Error reading logs:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

exports.clearLogs = async (req, res) => {
    try {
        const logPath = path.join(__dirname, '..', 'logs', 'app.log');
        fs.writeFileSync(logPath, '');
        res.json({ success: true, message: 'Logs cleared successfully' });
    } catch (error) {
        console.error('Error clearing logs:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

exports.getGDriveStatus = async (req, res) => {
    try {
        const user = await User.findById(req.session.userId);
        res.json({
            hasApiKey: !!user.gdrive_api_key,
            message: user.gdrive_api_key ? 'Google Drive API key is configured' : 'No Google Drive API key found'
        });
    } catch (error) {
        console.error('Error checking Google Drive API status:', error);
        res.status(500).json({ error: 'Failed to check API key status' });
    }
};

exports.updateGDrive = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            // Check if it's an API call or form submission
            if (req.xhr || req.headers.accept.indexOf('json') > -1) {
                return res.status(400).json({
                    success: false,
                    error: errors.array()[0].msg
                });
            }
            return res.render('settings', {
                title: 'Settings',
                active: 'settings',
                user: await User.findById(req.session.userId),
                error: errors.array()[0].msg,
                activeTab: 'integrations'
            });
        }
        await User.update(req.session.userId, {
            gdrive_api_key: req.body.apiKey
        });

        if (req.xhr || req.headers.accept.indexOf('json') > -1) {
            return res.json({
                success: true,
                message: 'Google Drive API key saved successfully!'
            });
        }

        return res.render('settings', {
            title: 'Settings',
            active: 'settings',
            user: await User.findById(req.session.userId),
            success: 'Google Drive API key saved successfully!',
            activeTab: 'integrations'
        });
    } catch (error) {
        console.error('Error saving Google Drive API key:', error);
        if (req.xhr || req.headers.accept.indexOf('json') > -1) {
            return res.status(500).json({
                success: false,
                error: 'An error occurred while saving your Google Drive API key'
            });
        }
        res.render('settings', {
            title: 'Settings',
            active: 'settings',
            user: await User.findById(req.session.userId),
            error: 'An error occurred while saving your Google Drive API key',
            activeTab: 'integrations'
        });
    }
};

exports.updateYouTubeCredentials = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: errors.array()[0].msg
            });
        }

        const { clientId, clientSecret } = req.body;
        const encryptedSecret = encrypt(clientSecret);

        await User.update(req.session.userId, {
            youtube_client_id: clientId,
            youtube_client_secret: encryptedSecret
        });

        return res.json({
            success: true,
            message: 'YouTube API credentials saved successfully!'
        });
    } catch (error) {
        console.error('Error saving YouTube credentials:', error);
        res.status(500).json({
            success: false,
            error: 'An error occurred while saving your YouTube credentials'
        });
    }
};

exports.getYouTubeStatus = async (req, res) => {
    try {
        const user = await User.findById(req.session.userId);

        const hasCredentials = !!(user.youtube_client_id && user.youtube_client_secret);
        const isConnected = !!(user.youtube_access_token && user.youtube_refresh_token);

        res.json({
            success: true,
            hasCredentials,
            isConnected,
            channelName: user.youtube_channel_name || null,
            channelId: user.youtube_channel_id || null
        });
    } catch (error) {
        console.error('Error checking YouTube status:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to check YouTube status'
        });
    }
};

exports.disconnectYouTube = async (req, res) => {
    try {
        await YoutubeChannel.deleteAll(req.session.userId);
        return res.json({
            success: true,
            message: 'All YouTube channels disconnected successfully'
        });
    } catch (error) {
        console.error('Error disconnecting YouTube:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to disconnect YouTube accounts'
        });
    }
};

exports.updateRecaptcha = async (req, res) => {
    try {
        const user = await User.findById(req.session.userId);
        if (user.user_role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'Only admin can manage reCAPTCHA settings'
            });
        }

        const { siteKey, secretKey, enabled } = req.body;

        if (!siteKey) {
            return res.status(400).json({
                success: false,
                error: 'Site Key is required'
            });
        }

        const existingSettings = await AppSettings.getRecaptchaSettings();

        if (secretKey) {
            const axios = require('axios');
            const verifyResponse = await axios.post(
                'https://www.google.com/recaptcha/api/siteverify',
                `secret=${encodeURIComponent(secretKey)}&response=test`,
                { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
            );
            const verifyData = verifyResponse.data;

            if (verifyData['error-codes'] && verifyData['error-codes'].includes('invalid-input-secret')) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid reCAPTCHA Secret Key. Please check your credentials.'
                });
            }

            const encryptedSecretKey = encrypt(secretKey);
            await AppSettings.setRecaptchaSettings(siteKey, encryptedSecretKey, enabled);
        } else if (existingSettings.hasKeys) {
            await AppSettings.set('recaptcha_site_key', siteKey);
            await AppSettings.set('recaptcha_enabled', enabled ? '1' : '0');
        } else {
            return res.status(400).json({
                success: false,
                error: 'Secret Key is required'
            });
        }

        return res.json({
            success: true,
            message: 'reCAPTCHA settings saved successfully!'
        });
    } catch (error) {
        console.error('Error saving reCAPTCHA settings:', error);
        res.status(500).json({
            success: false,
            error: 'An error occurred while saving reCAPTCHA settings'
        });
    }
};

exports.toggleRecaptcha = async (req, res) => {
    try {
        const user = await User.findById(req.session.userId);
        if (user.user_role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'Only admin can manage reCAPTCHA settings'
            });
        }

        const { enabled } = req.body;
        const recaptchaSettings = await AppSettings.getRecaptchaSettings();

        if (!recaptchaSettings.hasKeys) {
            return res.status(400).json({
                success: false,
                error: 'Please save reCAPTCHA keys first before enabling'
            });
        }

        await AppSettings.set('recaptcha_enabled', enabled ? '1' : '0');

        return res.json({
            success: true,
            message: enabled ? 'reCAPTCHA enabled' : 'reCAPTCHA disabled'
        });
    } catch (error) {
        console.error('Error toggling reCAPTCHA:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update reCAPTCHA status'
        });
    }
};

exports.deleteRecaptcha = async (req, res) => {
    try {
        const user = await User.findById(req.session.userId);
        if (user.user_role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'Only admin can manage reCAPTCHA settings'
            });
        }

        await AppSettings.deleteRecaptchaSettings();

        return res.json({
            success: true,
            message: 'reCAPTCHA keys removed successfully'
        });
    } catch (error) {
        console.error('Error removing reCAPTCHA keys:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to remove reCAPTCHA keys'
        });
    }
};

exports.getYouTubeChannels = async (req, res) => {
    try {
        const channels = await YoutubeChannel.findAll(req.session.userId);
        res.json({ success: true, channels });
    } catch (error) {
        console.error('Error fetching YouTube channels:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch channels' });
    }
};

exports.setDefaultYouTubeChannel = async (req, res) => {
    try {
        await YoutubeChannel.setDefault(req.session.userId, req.params.id);
        res.json({ success: true, message: 'Default channel updated' });
    } catch (error) {
        console.error('Error setting default channel:', error);
        res.status(500).json({ success: false, error: 'Failed to set default channel' });
    }
};

exports.deleteYouTubeChannel = async (req, res) => {
    try {
        const channel = await YoutubeChannel.findById(req.params.id);

        if (!channel || channel.user_id !== req.session.userId) {
            return res.status(404).json({ success: false, error: 'Channel not found' });
        }

        await YoutubeChannel.delete(req.params.id, req.session.userId);

        if (channel.is_default) {
            const channels = await YoutubeChannel.findAll(req.session.userId);
            if (channels.length > 0) {
                await YoutubeChannel.setDefault(req.session.userId, channels[0].id);
            }
        }

        res.json({ success: true, message: 'Channel disconnected successfully' });
    } catch (error) {
        console.error('Error disconnecting channel:', error);
        res.status(500).json({ success: false, error: 'Failed to disconnect channel' });
    }
};

exports.authYouTube = async (req, res) => {
    try {
        const user = await User.findById(req.session.userId);

        if (!user.youtube_client_id || !user.youtube_client_secret) {
            return res.redirect('/settings?error=Please save your YouTube API credentials first&activeTab=integration');
        }

        const clientSecret = decrypt(user.youtube_client_secret);
        if (!clientSecret) {
            return res.redirect('/settings?error=Failed to decrypt credentials&activeTab=integration');
        }

        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        const host = req.headers['x-forwarded-host'] || req.get('host');
        const redirectUri = `${protocol}://${host}/auth/youtube/callback`;

        const oauth2Client = getYouTubeOAuth2Client(user.youtube_client_id, clientSecret, redirectUri);

        const scopes = [
            'https://www.googleapis.com/auth/youtube.readonly',
            'https://www.googleapis.com/auth/youtube.force-ssl',
            'https://www.googleapis.com/auth/youtube'
        ];

        const authUrl = oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: scopes,
            prompt: 'consent',
            state: req.session.userId
        });

        res.redirect(authUrl);
    } catch (error) {
        console.error('YouTube OAuth error:', error);
        res.redirect('/settings?error=Failed to initiate YouTube authentication&activeTab=integration');
    }
};

exports.authYouTubeCallback = async (req, res) => {
    try {
        const { code, error, state } = req.query;

        if (error) {
            console.error('YouTube OAuth error:', error);
            return res.redirect(`/settings?error=${encodeURIComponent(error)}&activeTab=integration`);
        }

        if (!code) {
            return res.redirect('/settings?error=No authorization code received&activeTab=integration');
        }

        const user = await User.findById(req.session.userId);

        if (!user.youtube_client_id || !user.youtube_client_secret) {
            return res.redirect('/settings?error=YouTube credentials not found&activeTab=integration');
        }

        const clientSecret = decrypt(user.youtube_client_secret);
        if (!clientSecret) {
            return res.redirect('/settings?error=Failed to decrypt credentials&activeTab=integration');
        }

        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        const host = req.headers['x-forwarded-host'] || req.get('host');
        const redirectUri = `${protocol}://${host}/auth/youtube/callback`;

        const oauth2Client = getYouTubeOAuth2Client(user.youtube_client_id, clientSecret, redirectUri);

        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);

        const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
        const channelResponse = await youtube.channels.list({
            part: 'snippet,statistics',
            mine: true
        });

        if (!channelResponse.data.items || channelResponse.data.items.length === 0) {
            return res.redirect('/settings?error=No YouTube channel found for this account&activeTab=integration');
        }

        const channel = channelResponse.data.items[0];
        const channelId = channel.id;
        const channelName = channel.snippet.title;
        const channelThumbnail = channel.snippet.thumbnails?.default?.url || channel.snippet.thumbnails?.medium?.url || '';
        const subscriberCount = channel.statistics?.subscriberCount || '0';

        const existingChannel = await YoutubeChannel.findByChannelId(req.session.userId, channelId);

        if (existingChannel) {
            await YoutubeChannel.update(existingChannel.id, {
                access_token: encrypt(tokens.access_token),
                refresh_token: tokens.refresh_token ? encrypt(tokens.refresh_token) : existingChannel.refresh_token,
                channel_name: channelName,
                channel_thumbnail: channelThumbnail,
                subscriber_count: subscriberCount
            });
        } else {
            await YoutubeChannel.create({
                user_id: req.session.userId,
                channel_id: channelId,
                channel_name: channelName,
                channel_thumbnail: channelThumbnail,
                subscriber_count: subscriberCount,
                access_token: encrypt(tokens.access_token),
                refresh_token: tokens.refresh_token ? encrypt(tokens.refresh_token) : null
            });
        }

        await User.update(req.session.userId, {
            youtube_redirect_uri: redirectUri
        });

        res.redirect('/settings?success=YouTube channel connected successfully&activeTab=integration');
    } catch (error) {
        console.error('YouTube OAuth callback error:', error);
        const errorMessage = error.message || 'Failed to connect YouTube account';
        res.redirect(`/settings?error=${encodeURIComponent(errorMessage)}&activeTab=integration`);
    }
};

exports.getDiskUsage = async (req, res) => {
    try {
        const user = await User.findById(req.session.userId);
        const diskUsage = await User.getDiskUsage(req.session.userId);
        res.json({
            success: true,
            diskUsage: diskUsage,
            diskLimit: user.disk_limit || 0
        });
    } catch (error) {
        console.error('Get disk usage error:', error);
        res.status(500).json({ success: false, message: 'Failed to get disk usage' });
    }
};
