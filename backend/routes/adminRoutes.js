const express = require("express");
const authenticateToken = require("../middleware/authenticateToken");
const requireRole = require("../middleware/requireRole");
const User = require("../models/User");
const Gig = require("../models/Gig");
const Booking = require("../models/Booking");
const Transaction = require("../models/Transaction");

const router = express.Router();
router.get("/summary", authenticateToken, requireRole("admin"), async (req, res, next) => {
    try {
        const [users, gigs, bookings, transactions] = await Promise.all([
            User.countDocuments(), Gig.countDocuments(), Booking.countDocuments(), Transaction.countDocuments(),
        ]);
        return res.json({ users, gigs, bookings, transactions });
    } catch (error) {
        return next(error);
    }
});
module.exports = router;
