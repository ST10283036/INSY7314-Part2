const { rateLimit, ipKeyGenerator } = require("express-rate-limit");

function limiter(name, windowMs, limit, message, keyGenerator) {
    return rateLimit({
        windowMs, limit,
        standardHeaders: "draft-8",
        legacyHeaders: false,
        identifier: name,
        requestPropertyName: `${name}RateLimit`,
        message: { message },
        ...(keyGenerator ? { keyGenerator } : {}),
    });
}

const apiLimiter = limiter("api", 15 * 60 * 1000, 300,
    "Too many requests. Please try again later.");
const loginLimiter = limiter("login", 15 * 60 * 1000, 10,
    "Too many login attempts. Please wait before trying again.");
const registrationLimiter = limiter("registration", 60 * 60 * 1000, 10,
    "Too many registration attempts. Please try again later.");
const bookingLimiter = limiter("booking", 15 * 60 * 1000, 20,
    "Too many booking attempts. Please wait before trying again.",
    (req) => req.user ? `user:${req.user.id}` : ipKeyGenerator(req.ip));

module.exports = { apiLimiter, loginLimiter, registrationLimiter, bookingLimiter };
