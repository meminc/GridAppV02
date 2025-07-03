const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const { redisClient } = require('../../config/database');

// General API rate limiter
const apiLimiter = rateLimit({
    store: new RedisStore({
        client: redisClient,
        sendCommand: (...args) => redisClient.sendCommand(args),
        prefix: 'rl:api:',
    }),
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});

// Strict limiter for login attempts
const loginLimiter = rateLimit({
    store: new RedisStore({
        client: redisClient,
        sendCommand: (...args) => redisClient.sendCommand(args),
        prefix: 'rl:login:',
    }),
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit each IP to 5 login attempts per windowMs
    message: 'Too many login attempts, please try again later.',
    skipSuccessfulRequests: true,
});

// Limiter for registration
const registerLimiter = rateLimit({
    store: new RedisStore({
        client: redisClient,
        sendCommand: (...args) => redisClient.sendCommand(args),
        prefix: 'rl:register:',
    }),
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // Limit each IP to 3 registration attempts per hour
    message: 'Too many registration attempts, please try again later.',
});

// Limiter for password reset
const passwordResetLimiter = rateLimit({
    store: new RedisStore({
        client: redisClient,
        sendCommand: (...args) => redisClient.sendCommand(args),
        prefix: 'rl:pwreset:',
    }),
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // Limit each IP to 3 password reset requests per hour
    message: 'Too many password reset attempts, please try again later.',
});

module.exports = {
    api: apiLimiter,
    login: loginLimiter,
    register: registerLimiter,
    passwordReset: passwordResetLimiter,
};