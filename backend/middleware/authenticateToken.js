const jwt = require("jsonwebtoken");
const User = require("../models/User");
const VALID_ROLES = new Set(["client", "freelancer", "admin"]);

async function authenticateToken(req, res, next) {
    const authorization = req.get("authorization");

    const match = authorization
        ? authorization.trim().match(/^Bearer\s+(\S+)$/i)
        : null;

    if (!match) {
        return res.status(401).json({
            message: "Authentication required.",
        });
    }

    let decoded;
    try {
        decoded = jwt.verify(
            match[1],
            process.env.JWT_SECRET,
            {
                algorithms: ["HS256"],
                issuer: process.env.JWT_ISSUER,
                audience: process.env.JWT_AUDIENCE,
            }
        );

        if (
            !decoded || typeof decoded !== "object" ||
            typeof decoded.id !== "string" ||
            !/^[a-f0-9]{24}$/i.test(decoded.id) ||
            !VALID_ROLES.has(decoded.role) ||
            decoded.sub !== decoded.id ||
            !Number.isSafeInteger(decoded.iat) ||
            !Number.isSafeInteger(decoded.exp) ||
            decoded.exp <= decoded.iat ||
            decoded.iat > Math.floor(Date.now() / 1000)
        ) {
            return res.status(401).json({
                message: "Authentication required.",
            });
        }

    } catch {
        return res.status(401).json({
            message: "Authentication required.",
        });
    }

    try {
        const user = await User.findById(decoded.id).select("role isActive");
        if (!user || user.isActive === false || !VALID_ROLES.has(user.role)) {
            return res.status(401).json({ message: "Authentication required." });
        }
        req.user = { id: user._id.toString(), role: user.role };
        return next();
    } catch (error) {
        return next(error);
    }
}

module.exports = authenticateToken;
