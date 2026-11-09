const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
    {
        username: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            lowercase: true,
        },
        passwordHash: {
            type: String,
            required: true,
            select: false,
        },
        role: {
            type: String,
            enum: ["client", "freelancer", "admin"],
            default: "client",
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        // Incremented on logout. Every JWT carries the version it was issued
        // under, so bumping it revokes all tokens issued before (see
        // authenticateToken).
        tokenVersion: {
            type: Number,
            default: 0,
            min: 0,
            select: false,
        },
        // Brute-force protection state (see config/lockout.js). Hidden from
        // normal queries; only the login controller reads them explicitly.
        failedLoginAttempts: {
            type: Number,
            default: 0,
            min: 0,
            select: false,
        },
        lockUntil: {
            type: Date,
            default: null,
            select: false,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
