function errorHandler(error, req, res, next) {
    if (res.headersSent) return next(error);
    if (error.code === "CORS_ORIGIN_DENIED") {
        return res.status(403).json({ message: "Request origin is not allowed." });
    }
    if (error.type === "entity.too.large") {
        return res.status(413).json({ message: "Request body is too large." });
    }
    if (error.type === "entity.parse.failed") {
        return res.status(400).json({ message: "Invalid JSON body." });
    }
    if (error.name === "ValidationError" || error.name === "CastError" || error.name === "StrictModeError") {
        return res.status(400).json({ message: "Invalid request data." });
    }
    console.error("An unexpected request error occurred.");
    return res.status(500).json({ message: "An unexpected error occurred." });
}

module.exports = errorHandler;
