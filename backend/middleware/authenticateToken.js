const jwt = require("jsonwebtoken");
const User = require("../models/User");
const logger = require("../utils/logger");
const VALID_ROLES = new Set(["client", "freelancer", "admin"]);

async function authenticateToken(req, res, next) {
    // Every rejection returns the same generic 401; the reason is only logged.
    const reject = (reason) => {
        logger.event("token_rejected", { level: "warn", outcome: "denied", req, reason });
        return res.status(401).json({ message: "Authentication required." });
    };

    const authorization = req.get("authorization");

    const match = authorization
        ? authorization.trim().match(/^Bearer\s+(\S+)$/i)
        : null;

    if (!match) {
        return reject("missing_or_malformed");
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
            decoded.iat > Math.floor(Date.now() / 1000) ||
            (decoded.tv !== undefined &&
                (!Number.isSafeInteger(decoded.tv) || decoded.tv < 0))
        ) {
            return reject("invalid_claims");
        }

    } catch {
        return reject("invalid_token");
    }

    try {
        const user = await User.findById(decoded.id).select("role isActive +tokenVersion");
        if (!user || user.isActive === false || !VALID_ROLES.has(user.role)) {
            return reject("account_missing_or_inactive");
        }

        // A token issued before the latest logout carries an older version.
        // Tokens signed before this check existed have no claim and count as 0.
        if ((decoded.tv ?? 0) !== (user.tokenVersion ?? 0)) {
            return reject("token_revoked");
        }
        req.user = { id: user._id.toString(), role: user.role };
        return next();
    } catch (error) {
        return next(error);
    }
}

module.exports = authenticateToken;
