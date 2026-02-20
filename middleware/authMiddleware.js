const User = require('../models/User');

const isAuthenticated = (req, res, next) => {
    if (req.session.userId) {
        return next();
    }
    res.redirect('/login');
};

const isAdmin = async (req, res, next) => {
    try {
        if (!req.session.userId) {
            return res.redirect('/login');
        }

        const user = await User.findById(req.session.userId);
        if (!user || user.user_role !== 'admin') {
            return res.redirect('/dashboard');
        }

        req.user = user;
        next();
    } catch (error) {
        console.error('Admin middleware error:', error);
        res.redirect('/dashboard');
    }
};

module.exports = {
    isAuthenticated,
    isAdmin
};
