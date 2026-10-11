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
        },
        role: {
            type: String,
            enum: ["client", "freelancer", "admin"],
            default: "client",
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);