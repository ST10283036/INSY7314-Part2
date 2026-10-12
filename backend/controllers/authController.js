const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const BCRYPT_SALT_ROUNDS = 12;
const DEFAULT_ROLE = "client";

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
        }).select("+passwordHash");

        if (!user || user.isActive === false) {
            return res.status(401).json({
                message: "Invalid username or password.",
            });
        }

        const passwordMatches = await bcrypt.compare(
            password,
            user.passwordHash
        );

        if (!passwordMatches) {
            return res.status(401).json({
                message: "Invalid username or password.",
            });
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
