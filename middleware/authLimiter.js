const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        res.status(429).render('login', {
            title: 'Login',
            error: 'Too many login attempts. Please try again in 15 minutes.'
        });
    },
    requestWasSuccessful: (request, response) => {
        return response.statusCode < 400;
    }
});

const loginDelayMiddleware = async (req, res, next) => {
    await new Promise(resolve => setTimeout(resolve, 1000));
    next();
};

module.exports = {
    loginLimiter,
    loginDelayMiddleware
};
