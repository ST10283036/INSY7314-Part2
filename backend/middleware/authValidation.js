const { body, validationResult } = require("express-validator");

function allowOnlyFields (allowedFields) {
    return (req, res, next) => {
        if (
            !req.body ||
            typeof req.body !== "object" ||
            Array.isArray(req.body)
        ) {
            return res.status(400).json({
                message: "Request body must be a JSON object.",
            });
        }   

        const unexpectedFields = Object.keys(req.body).filter(
            (field) => !allowedFields.includes(field)
        );

        if (unexpectedFields.length > 0) {
            return res.status(400).json({
                message: "Request contains unsupported fields.",
            });
        }
    
        return next();
    };
}

function usernameRule() {
    return body("username")
        .exists({ values: "falsy" })
        .withMessage("Username is required.")
        .bail()
        .isString()
        .withMessage("Username must be text.")
        .bail()
        .trim()
        .isLength({ min: 3, max: 30 })
        .withMessage("Username must be between 3 and 30 characters.")
        .matches(/^[A-Za-z0-9_]+$/)
        .withMessage(
            "Username may contain only letters, numbers, and underscores."
        ).toLowerCase();
}

function registrationPasswordRule() {
    return body("password")
        .exists({ values: "falsy" })
        .withMessage("Password is required.")
        .bail()
        .isString()
        .withMessage("Password must be text.")
        .bail()
        .isLength({ min: 8 })
        .withMessage("Password must contain at least 8 characters.")
        .custom(
            (password) =>
                Buffer.byteLength(password, "utf8") <= 72
        )
        .withMessage("Password must not exceed 72 bytes.")
        .matches(/[a-z]/)
        .withMessage("Password must contain a lowercase letter.")
        .matches(/[A-Z]/)
        .withMessage("Password must contain an uppercase letter.")
        .matches(/[0-9]/)
        .withMessage("Password must contain a number.")
        .matches(/[^A-Za-z0-9]/)
        .withMessage("Password must contain a special character.");
}

function roleRule() {
    return body("role")
        .optional()
        .isString()
        .withMessage("Role must be text.")
        .bail()
        .isIn(["client", "freelancer"])
        .withMessage("Role must be either client or freelancer.");
}

function loginPasswordRule() {
    return body("password")
        .exists({ values: "falsy" })
        .withMessage("Password is required.")
        .bail()
        .isString()
        .withMessage("Password must be text.")
        .bail()
        .custom(
            (password) =>
                Buffer.byteLength(password, "utf8") <= 72
        )
        .withMessage("Password must not exceed 72 bytes.");
}

function handleValidationErrors(req, res, next) {
    const errors = validationResult(req);

    if (errors.isEmpty()) {
        return next();
    }

    return res.status(400).json({
        message: "Validation failed.",
        errors: errors
            .array({ onlyFirstError: true })
            .map((error) => ({
                field: error.path,
                message: error.msg,
            })),
    });
}

const registerValidation = [
    allowOnlyFields(["username", "password", "role"]),
    usernameRule(),
    registrationPasswordRule(),
    roleRule(),
    handleValidationErrors,
];

const loginValidation = [
    allowOnlyFields(["username", "password"]),
    usernameRule(),
    loginPasswordRule(),
    handleValidationErrors,
];

    
module.exports = {
    registerValidation,
    loginValidation,
};
