const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const logger = require("../utils/logger");
const { MAX_FAILED_LOGINS, LOCKOUT_MS } = require("../config/lockout");

const BCRYPT_SALT_ROUNDS = 12;
const DEFAULT_ROLE = "client";

function sendLockedResponse(res, lockUntil) {
    const seconds = Math.max(1, Math.ceil((lockUntil.getTime() - Date.now()) / 1000));
    const minutes = Math.ceil(seconds / 60);

    res.set("Retry-After", String(seconds));

    return res.status(429).json({
        message:
            "Too many failed login attempts. This account is temporarily locked. " +
            `Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
    });
}

// Counts a wrong password atomically. Returns the lock expiry if this attempt
// triggered a lock, otherwise null.
async function recordFailedLogin(userId) {
    const updated = await User.findOneAndUpdate(
        { _id: userId },
        { $inc: { failedLoginAttempts: 1 } },
        { returnDocument: "after" }
    ).select("+failedLoginAttempts");

    if (updated && updated.failedLoginAttempts >= MAX_FAILED_LOGINS) {
        const lockUntil = new Date(Date.now() + LOCKOUT_MS);

        await User.updateOne(
            { _id: userId },
            { $set: { failedLoginAttempts: 0, lockUntil } }
        );

        return lockUntil;
    }

    return null;
}

async function register(req, res) {
    const { username, password, role } = req.body;
    if (role !== undefined && !["client", "freelancer"].includes(role)) {
        return res.status(400).json({ message: "Choose client or freelancer." });
    }

    try {
        const existingUser = await User.findOne({
            username: username.toLowerCase(),
        });

        if (existingUser) {
        logger.event("registration_rejected", { level: "warn", outcome: "username_taken", req });
        return res.status(409).json({
            message: "That username is already taken.",
            });
        }

        const passwordHash = await bcrypt.hash(
            password,
            BCRYPT_SALT_ROUNDS
        );

        const newUser = await User.create({
            username,
            passwordHash,
            role: role || DEFAULT_ROLE,
        });

        logger.event("user_registered", { req, accountId: newUser.id, accountRole: newUser.role });

        return res.status(201).json({
            message: "User registered successfully.",
            user: {
                id: newUser.id,
                username: newUser.username,
                role: newUser.role,
            },
        });
    } catch (error) {
        if (error.code === 11000) {
            logger.event("registration_rejected", { level: "warn", outcome: "username_taken", req });
            return res.status(409).json({
                message: "That username is already taken.",
            });
        }

        logger.unexpected(req, "register", error);

        return res.status(500).json({
            message: "An unexpected error occurred.",
        });
    }
}

async function login(req, res) {
    const { username, password } = req.body;

    try {
        const user = await User.findOne({
            username: username.toLowerCase()
        }).select("+passwordHash +failedLoginAttempts +lockUntil +tokenVersion");

        if (!user || user.isActive === false) {
            logger.event("login_failed", {
                level: "warn", outcome: "denied", req, reason: "unknown_or_inactive_account", username,
            });
            return res.status(401).json({
                message: "Invalid username or password.",
            });
        }

        // A locked account is rejected before any password check, so the lock
        // cannot be used to guess passwords and costs no bcrypt work.
        if (user.lockUntil && user.lockUntil.getTime() > Date.now()) {
            logger.event("login_blocked", {
                level: "warn", outcome: "account_locked", req, accountId: user.id, username,
            });
            return sendLockedResponse(res, user.lockUntil);
        }

        const passwordMatches = await bcrypt.compare(
            password,
            user.passwordHash
        );

        if (!passwordMatches) {
            const lockUntil = await recordFailedLogin(user._id);

            logger.event("login_failed", {
                level: "warn", outcome: "denied", req, reason: "wrong_password", accountId: user.id, username,
            });

            if (lockUntil) {
                logger.event("account_locked", {
                    level: "warn", outcome: "locked", req, accountId: user.id,
                    lockMinutes: Math.round(LOCKOUT_MS / 60000),
                });
                return sendLockedResponse(res, lockUntil);
            }

            return res.status(401).json({
                message: "Invalid username or password.",
            });
        }

        if (user.failedLoginAttempts > 0 || user.lockUntil) {
            await User.updateOne(
                { _id: user._id },
                { $set: { failedLoginAttempts: 0, lockUntil: null } }
            );
        }

        const userId = user._id.toString();

        const token = jwt.sign(
            {
                id: user.id,
                role: user.role,
                tv: user.tokenVersion || 0,
            },
            process.env.JWT_SECRET,
            {
                algorithm: "HS256",
                expiresIn: process.env.JWT_EXPIRES_IN,
                issuer: process.env.JWT_ISSUER,
                audience: process.env.JWT_AUDIENCE,
                subject: userId,
            }
        );

        logger.event("login_succeeded", { req, accountId: user.id, accountRole: user.role });

        return res.status(200).json({
            message: "Login successful.",
            token,
            tokenType: "Bearer",
            expiresIn: process.env.JWT_EXPIRES_IN,
            user: {
                id: user._id,
                username: user.username,
                role: user.role,
            },
        });
    } catch (error) {
        logger.unexpected(req, "login", error);

        return res.status(500).json({
            message: "An unexpected error occurred.",
        });
    }
}  
  
// Revokes every token issued to this account so far (a stolen token stops
// working as soon as its owner logs out). New logins get the new version.
async function logout(req, res) {
    try {
        await User.updateOne(
            { _id: req.user.id },
            { $inc: { tokenVersion: 1 } }
        );

        logger.event("logout", { req, outcome: "tokens_revoked" });

        return res.status(200).json({
            message: "Logged out. All sessions for this account have been signed out.",
        });
    } catch (error) {
        logger.unexpected(req, "logout", error);

        return res.status(500).json({
            message: "An unexpected error occurred.",
        });
    }
}

module.exports = { register, login, logout };
