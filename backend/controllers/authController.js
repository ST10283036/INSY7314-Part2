const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
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
            return res.status(409).json({
                message: "That username is already taken.",
            });
        }

        console.error("Registration failed unexpectedly.");

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
        }).select("+passwordHash +failedLoginAttempts +lockUntil");

        if (!user || user.isActive === false) {
            return res.status(401).json({
                message: "Invalid username or password.",
            });
        }

        // A locked account is rejected before any password check, so the lock
        // cannot be used to guess passwords and costs no bcrypt work.
        if (user.lockUntil && user.lockUntil.getTime() > Date.now()) {
            return sendLockedResponse(res, user.lockUntil);
        }

        const passwordMatches = await bcrypt.compare(
            password,
            user.passwordHash
        );

        if (!passwordMatches) {
            const lockUntil = await recordFailedLogin(user._id);

            if (lockUntil) {
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
    } catch {
        console.error("Login failed unexpectedly.");

        return res.status(500).json({
            message: "An unexpected error occurred.",
        });
    }
}  
  
module.exports = { register, login };
