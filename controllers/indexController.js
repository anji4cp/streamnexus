const User = require('../models/User');
const Stream = require('../models/Stream');
const YoutubeChannel = require('../models/YoutubeChannel');
const { db } = require('../db/database');
const packageJson = require('../package.json');

exports.getIndex = (req, res) => {
    res.redirect('/dashboard');
};

exports.getWelcome = async (req, res) => {
    try {
        const user = await User.findById(req.session.userId);
        if (!user || user.welcome_shown === 1) {
            return res.redirect('/dashboard');
        }
        res.render('welcome', {
            title: 'Welcome'
        });
    } catch (error) {
        console.error('Welcome page error:', error);
        res.redirect('/dashboard');
    }
};

exports.getWelcomeBypass = (req, res) => {
    res.render('welcome', {
        title: 'Welcome'
    });
};

exports.getWelcomeContinue = async (req, res) => {
    try {
        await new Promise((resolve, reject) => {
            db.run('UPDATE users SET welcome_shown = 1 WHERE id = ?', [req.session.userId], function (err) {
                if (err) reject(err);
                else resolve();
            });
        });
        res.redirect('/dashboard');
    } catch (error) {
        console.error('Welcome continue error:', error);
        res.redirect('/dashboard');
    }
};

exports.getDashboard = async (req, res) => {
    try {
        const user = await User.findById(req.session.userId);
        if (!user) {
            req.session.destroy();
            return res.redirect('/login');
        }
        const youtubeChannels = await YoutubeChannel.findAll(req.session.userId);
        const hasYoutubeCredentials = !!(user.youtube_client_id && user.youtube_client_secret);
        const isYoutubeConnected = youtubeChannels.length > 0;
        const defaultChannel = youtubeChannels.find(c => c.is_default) || youtubeChannels[0];

        const initialStreamsData = await Stream.findAllPaginated(req.session.userId, {
            page: 1,
            limit: 10,
            search: ''
        });

        res.render('dashboard', {
            title: 'Dashboard',
            active: 'dashboard',
            user: user,
            youtubeConnected: isYoutubeConnected,
            youtubeChannels: youtubeChannels,
            youtubeChannelName: defaultChannel?.channel_name || '',
            youtubeChannelThumbnail: defaultChannel?.channel_thumbnail || '',
            youtubeSubscriberCount: defaultChannel?.subscriber_count || '0',
            hasYoutubeCredentials: hasYoutubeCredentials,
            initialStreams: JSON.stringify(initialStreamsData.streams),
            initialPagination: JSON.stringify(initialStreamsData.pagination)
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.redirect('/login');
    }
};

exports.getDonators = async (req, res) => {
    try {
        const axios = require('axios');
        const response = await axios.get('https://donate.youtube101.id/api/donators', {
            params: { limit: 20 }
        });
        res.json(response.data);
    } catch (error) {
        console.error('Error fetching donators:', error.message);
        res.json([]);
    }
};

exports.getServerTime = (req, res) => {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = monthNames[now.getMonth()];
    const year = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const formattedTime = `${day} ${month} ${year} ${hours}:${minutes}:${seconds}`;
    const serverTimezoneOffset = now.getTimezoneOffset();
    res.json({
        serverTime: now.toISOString(),
        formattedTime: formattedTime,
        timezoneOffset: serverTimezoneOffset
    });
};
