const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const users = [];
let nextId = 1;

const BCRYPT_SALT_ROUNDS = 12;
const DEFAULT_ROLE = "client";

async function register(req, res) {
    const { username, password } = req.body;

    const existingUser = users.find(
        (user) =>
            user.username.toLowerCase() === username.toLowerCase()
    );

    if (existingUser) {
        return res.status(409).json({
            message: "That username is already taken.",
        });
    }

    try {
        const passwordHash = await bcrypt.hash(
            password,
            BCRYPT_SALT_ROUNDS
        );

        const newUser = {
            id: nextId,
            username,
            passwordHash,
            role: DEFAULT_ROLE,
        };

        users.push(newUser);
        nextId += 1;

        return res.status(201).json({
            message: "User registered successfully.",
            user: {
                id: newUser.id,
                username: newUser.username,
                role: newUser.role,
            },
        });
    } catch {
        console.error("Registration failed unexpectedly.");

        return res.status(500).json({
            message: "An unexpected error occurred.",
        });
    }
}

async function login(req, res) {
    const { username, password } = req.body;

    try {
        const user = users.find(
            (storedUser) =>
                storedUser.username.toLowerCase() ===
                username.toLowerCase()
        );

        if (!user) {
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
                subject: String(user.id),
            }
        );

        return res.status(200).json({
            message: "Login successful.",
            token,
            tokenType: "Bearer",
            expiresIn: process.env.JWT_EXPIRES_IN,
            user: {
                id: user.id,
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