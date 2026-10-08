const jwt = require("jsonwebtoken");

function authenticateToken(req, res, next) {
    const authorization = req.get("authorization");

    const match = authorization
        ? authorization.trim().match(/^Bearer\s+(\S+)$/i)
        : null;

    if (!match) {
        return res.status(401).json({
            message: "Authentication required.",
        });
    }

    try {
        const decoded = jwt.verify(
            match[1],
            process.env.JWT_SECRET,
            {
                algorithms: ["HS256"],
                issuer: process.env.JWT_ISSUER,
                audience: process.env.JWT_AUDIENCE,
            }
        );

        if (
            typeof decoded !== "object" ||
            !Number.isInteger(decoded.id) ||
            typeof decoded.role !== "string"
        ) {
            return res.status(401).json({
                message: "Authentication required.",
            });
        }

        req.user = {
            id: decoded.id,
            role: decoded.role,
        };

        return next();
    } catch {
        return res.status(401).json({
            message: "Authentication required.",
        });
    }
}

module.exports = authenticateToken;