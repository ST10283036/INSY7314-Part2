const { body, param, validationResult } = require("express-validator");

function allowOnlyFields(allowedFields) {
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

const createGigValidation = [
    allowOnlyFields(["title", "description", "price"]),
    body("title")
        .exists({ values: "falsy" })
        .withMessage("Title is required.")
        .bail()
        .isString()
        .withMessage("Title must be next.")
        .bail()
        .trim()
        .isLength({ min: 3, max: 100 })
        .withMessage("Title must be between 3 and 100 characters.")
        .escape(),
    body("description")
        .exists({ values: "falsy" })
        .withMessage("Description is required.")
        .bail()
        .isString()
        .withMessage("Description must be text.")
        .bail()
        .trim()
        .isLength({ min: 10, max: 1000 })
        .withMessage("Description must be between 10 and 1000 characters.")
        .escape(),
    body("price")
        .exists({ values: "falsy" })
        .withMessage("Price is required.")
        .bail()
        .isFloat({ min: 1, max: 1000000 })
        .withMessage("Price must be a number between 1 and 1000000.")
        .toFloat(),
    handleValidationErrors,
];

const gigIdValidation = [
    param("id").isMongoId().withMessage("Invalid gig id."),
    handleValidationErrors,
];

module.exports = { createGigValidation, gigIdValidation };