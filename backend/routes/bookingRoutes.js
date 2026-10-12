const express = require("express");
const authenticateToken = require("../middleware/authenticateToken");
const requireRole = require("../middleware/requireRole");
const {
    createBookingValidation,
} = require("../middleware/bookingValidation");
const bookingController = require("../controllers/bookingController");
const { bookingLimiter } = require("../middleware/rateLimiters");
const { param } = require("express-validator");
const { handleValidationErrors } = require("../middleware/requestValidation");

const router = express.Router();

router.post(
    "/",
    authenticateToken,
    requireRole("client"),
    bookingLimiter,
    createBookingValidation,
    bookingController.createBooking
);

router.get(
    "/mine",
    authenticateToken,
    requireRole("client", "freelancer"),
    bookingController.listMyBookings
);

router.get(
    "/:id",
    authenticateToken,
    requireRole("client", "freelancer"),
    param("id").isMongoId().withMessage("Invalid booking id."),
    handleValidationErrors,
    bookingController.getMyBooking
);

module.exports = router;
