const express = require("express");
const authenticateToken = require("../middleware/authenticateToken");
const requireRole = require("../middleware/requireRole");
const {
    createBookingValidation,
} = require("../middleware/bookingValidation");
const bookingController = require("../controllers/bookingController");

const router = express.Router();

router.post(
    "/",
    authenticateToken,
    requireRole("client"),
    createBookingValidation,
    bookingController.createBooking
);

router.get(
    "/mine",
    authenticateToken,
    requireRole("client", "freelancer"),
    bookingController.listMyBookings
);

module.exports = router;