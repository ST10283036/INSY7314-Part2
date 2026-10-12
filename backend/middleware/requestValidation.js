const { validationResult } = require("express-validator");
const sanitizeHtml = require("sanitize-html");

function allowOnlyFields(allowed) {
    return (req, res, next) => {
        if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
            return res.status(400).json({ message: "Request body must be a JSON object." });
        }
        if (Object.keys(req.body).some((field) => !allowed.includes(field))) {
            return res.status(400).json({ message: "Request contains unsupported fields." });
        }
        return next();
    };
}

function handleValidationErrors(req, res, next) {
    const errors = validationResult(req);
    if (errors.isEmpty()) return next();
    return res.status(400).json({
        message: "Validation failed.",
        errors: errors.array({ onlyFirstError: true }).map((error) => ({
            field: error.path, message: error.msg,
        })),
    });
}

function plainText(value) {
    return sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} }).trim();
}

module.exports = { allowOnlyFields, handleValidationErrors, plainText };
