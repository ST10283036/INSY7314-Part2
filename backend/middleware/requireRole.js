function requireRole(...allowedRoles) {
    const roles = new Set(["client", "freelancer", "admin"]);
    if (!allowedRoles.length || allowedRoles.some((role) => !roles.has(role))) {
        throw new Error("Invalid role configuration.");
    }
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ message: "Authentication required." });
        }
        if (!roles.has(req.user.role) || !allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                message: "You do not have permission to perform this action.",
            });
        }

        return next();
    };
}

module.exports = requireRole;
