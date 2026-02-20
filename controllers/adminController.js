const User = require('../models/User');
const Video = require('../models/Video');
const Stream = require('../models/Stream');
const { db } = require('../db/database');
const systemMonitor = require('../services/systemMonitor');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');

exports.getUsers = async (req, res) => {
    try {
        const users = await User.findAll();

        const usersWithStats = await Promise.all(users.map(async (user) => {
            const videoStats = await new Promise((resolve, reject) => {
                db.get(
                    `SELECT COUNT(*) as count, COALESCE(SUM(file_size), 0) as totalSize 
           FROM videos WHERE user_id = ?`,
                    [user.id],
                    (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    }
                );
            });

            const streamStats = await new Promise((resolve, reject) => {
                db.get(
                    `SELECT COUNT(*) as count FROM streams WHERE user_id = ?`,
                    [user.id],
                    (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    }
                );
            });

            const activeStreamStats = await new Promise((resolve, reject) => {
                db.get(
                    `SELECT COUNT(*) as count FROM streams WHERE user_id = ? AND status = 'live'`,
                    [user.id],
                    (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    }
                );
            });

            const formatFileSize = (bytes) => {
                if (bytes === 0) return '0 B';
                const k = 1024;
                const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
                const i = Math.floor(Math.log(bytes) / Math.log(k));
                return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
            };

            return {
                ...user,
                videoCount: videoStats.count,
                totalVideoSize: videoStats.totalSize > 0 ? formatFileSize(videoStats.totalSize) : null,
                streamCount: streamStats.count,
                activeStreamCount: activeStreamStats.count
            };
        }));

        res.render('users', {
            title: 'User Management',
            active: 'users',
            users: usersWithStats,
            user: req.user
        });
    } catch (error) {
        console.error('Users page error:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Failed to load users page',
            user: req.user
        });
    }
};

exports.updateUserStatus = async (req, res) => {
    try {
        const { userId, status } = req.body;

        if (!userId || !status || !['active', 'inactive'].includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid user ID or status'
            });
        }

        if (userId == req.session.userId) {
            return res.status(400).json({
                success: false,
                message: 'Cannot change your own status'
            });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        await User.updateStatus(userId, status);

        res.json({
            success: true,
            message: `User ${status === 'active' ? 'activated' : 'deactivated'} successfully`
        });
    } catch (error) {
        console.error('Error updating user status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update user status'
        });
    }
};

exports.updateUserRole = async (req, res) => {
    try {
        const { userId, role } = req.body;

        if (!userId || !role || !['admin', 'member'].includes(role)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid user ID or role'
            });
        }

        if (userId == req.session.userId) {
            return res.status(400).json({
                success: false,
                message: 'Cannot change your own role'
            });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        await User.updateRole(userId, role);

        res.json({
            success: true,
            message: `User role updated to ${role} successfully`
        });
    } catch (error) {
        console.error('Error updating user role:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update user role'
        });
    }
};

exports.deleteUser = async (req, res) => {
    try {
        const { userId } = req.body;

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: 'Invalid user ID'
            });
        }

        if (userId == req.session.userId) {
            return res.status(400).json({
                success: false,
                message: 'Cannot delete your own account'
            });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        await User.delete(userId);

        res.json({
            success: true,
            message: 'User deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete user'
        });
    }
};

exports.updateUser = async (req, res) => {
    try {
        const { userId, username, role, status, password, diskLimit } = req.body;

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: 'Invalid user ID'
            });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        let avatarPath = user.avatar_path;
        if (req.file) {
            avatarPath = `/uploads/avatars/${req.file.filename}`;
        }

        const updateData = {
            username: username || user.username,
            user_role: role || user.user_role,
            status: status || user.status,
            avatar_path: avatarPath,
            disk_limit: diskLimit !== undefined && diskLimit !== '' ? parseInt(diskLimit) : user.disk_limit
        };

        if (password && password.trim() !== '') {
            updateData.password = await bcrypt.hash(password, 10);
        }

        await User.updateProfile(userId, updateData);

        res.json({
            success: true,
            message: 'User updated successfully'
        });
    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update user'
        });
    }
};

exports.createUser = async (req, res) => {
    try {
        const { username, role, status, password, diskLimit } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: 'Username and password are required'
            });
        }

        const existingUser = await User.findByUsername(username);
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'Username already exists'
            });
        }

        let avatarPath = '/uploads/avatars/default-avatar.png';
        if (req.file) {
            avatarPath = `/uploads/avatars/${req.file.filename}`;
        }

        const userData = {
            username: username,
            password: password,
            user_role: role || 'user',
            status: status || 'active',
            avatar_path: avatarPath,
            disk_limit: diskLimit ? parseInt(diskLimit) : 0
        };

        const result = await User.create(userData);

        res.json({
            success: true,
            message: 'User created successfully',
            userId: result.id
        });
    } catch (error) {
        console.error('Error creating user:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create user'
        });
    }
};

exports.getUserVideos = async (req, res) => {
    try {
        const userId = req.params.id;
        const videos = await Video.findAll(userId);
        res.json({ success: true, videos });
    } catch (error) {
        console.error('Get user videos error:', error);
        res.status(500).json({ success: false, message: 'Failed to get user videos' });
    }
};

exports.getUserStreams = async (req, res) => {
    try {
        const userId = req.params.id;
        const streams = await Stream.findAll(userId);
        res.json({ success: true, streams });
    } catch (error) {
        console.error('Get user streams error:', error);
        res.status(500).json({ success: false, message: 'Failed to get user streams' });
    }
};

exports.getSystemStats = async (req, res) => {
    try {
        const stats = await systemMonitor.getSystemStats();
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
