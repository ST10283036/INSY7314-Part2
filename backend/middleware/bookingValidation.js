const { body } = require("express-validator");
const {
    allowOnlyFields,
    handleValidationErrors,
} = require("./requestValidation");

const createBookingValidation = [
    allowOnlyFields(["gigId"]),
    body("gigId")
        .exists({ values: "falsy" })
        .withMessage("Gig id is required.")
        .bail()
        .isString()
        .withMessage("Gig id must be text.")
        .bail()
        .isMongoId()
        .withMessage("Invalid gig id."),
    handleValidationErrors,
];

module.exports = { createBookingValidation };
