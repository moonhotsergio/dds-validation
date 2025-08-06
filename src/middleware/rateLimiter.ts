import rateLimit from 'express-rate-limit';

export const createRateLimiter = (windowMs: number, max: number, message?: string) => {
    return rateLimit({
        windowMs,
        max,
        message: message || 'Too many requests from this IP, please try again later.',
        standardHeaders: true,
        legacyHeaders: false,
    });
};

export const generalLimiter = createRateLimiter(
    parseInt(process.env.RATE_LIMIT_WINDOW_MS || '3600000'), // 1 hour
    parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100')
);

export const strictLimiter = createRateLimiter(
    3600000, // 1 hour
    5, // 5 requests per hour
    'Too many attempts, please try again later.'
);