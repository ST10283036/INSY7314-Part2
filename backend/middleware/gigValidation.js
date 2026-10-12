const { body, param } = require("express-validator");
const {
    allowOnlyFields,
    handleValidationErrors,
    plainText,
} = require("./requestValidation");

function textRule(field, minimum, maximum, optional = false) {
    const rule = body(field);
    if (optional) rule.optional();
    return rule
        .isString().withMessage(`${field} must be text.`).bail()
        .isLength({ max: 4000 }).withMessage(`${field} is too long.`).bail()
        .customSanitizer(plainText)
        .isLength({ min: minimum, max: maximum })
        .withMessage(`${field} must contain ${minimum} to ${maximum} characters.`);
}

function priceRule(optional = false) {
    const rule = body("price");
    if (optional) rule.optional();
    return rule.custom((value) =>
        typeof value === "number" &&
        Number.isFinite(value) &&
        value >= 1 && value <= 1000000 &&
        Math.abs(value * 100 - Math.round(value * 100)) < 0.0000001
    ).withMessage("Price must be a number from 1 to 1000000 with at most two decimal places.");
}

const idRule = () => param("id").isMongoId().withMessage("Invalid gig id.");

const createGigValidation = [
    allowOnlyFields(["title", "description", "price"]),
    textRule("title", 3, 100),
    textRule("description", 10, 1000),
    priceRule(),
    handleValidationErrors,
];

const gigIdValidation = [idRule(), handleValidationErrors];

const updateGigValidation = [
    idRule(),
    allowOnlyFields(["title", "description", "price", "isAvailable"]),
    (req, res, next) => {
        if (!Object.keys(req.body).length) {
            return res.status(400).json({ message: "Provide at least one field to update." });
        }
        return next();
    },
    textRule("title", 3, 100, true),
    textRule("description", 10, 1000, true),
    priceRule(true),
    body("isAvailable").optional()
        .custom((value) => typeof value === "boolean")
        .withMessage("isAvailable must be true or false."),
    handleValidationErrors,
];

module.exports = {
    createGigValidation,
    gigIdValidation,
    updateGigValidation,
    allowOnlyFields,
    handleValidationErrors,
};
