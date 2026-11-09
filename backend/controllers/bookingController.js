const Gig = require("../models/Gig");
const Booking = require("../models/Booking");
const Transaction = require("../models/Transaction");
const logger = require("../utils/logger");

function formatBooking(booking) {
    return {
        id: booking._id,
        gig: booking.gig,
        client: booking.client,
        freelancer: booking.freelancer,
        price: booking.price,
        status: booking.status,
        createdAt: booking.createdAt,
    };
}

async function createBooking(req, res) {
    const { gigId } = req.body;

    try {
        const gig = await Gig.findOne({ _id: gigId, isAvailable: true });

        if (!gig) {
            return res.status(404).json({ message: "Gig not found" });
        }

        const existingActiveBooking = await Booking.findOne({
            gig: gig._id,
            client: req.user.id,
            status: "confirmed",
        });

        if (existingActiveBooking) {
            logger.event("booking_rejected", {
                level: "warn", outcome: "duplicate", req, gigId: String(gig._id),
            });
            return res.status(409).json({
                message: "You already have an active booking for this gig.",
            });
        }

        const booking = await Booking.create({
            gig: gig._id,
            client: req.user.id,
            freelancer: gig.freelancer,
            price: gig.price,
        });

        let transaction;

        try {
            transaction = await Transaction.create({
                booking: booking._id,
                client: req.user.id,
                freelancer: gig.freelancer,
                amount: gig.price,
            });
        } catch (error) {
            await Booking.deleteOne({ _id: booking._id });
            logger.event("booking_rolled_back", {
                level: "error", outcome: "failure", req, bookingId: String(booking._id), error,
            });
            throw error;
        }

        logger.event("booking_created", {
            req, bookingId: String(booking._id), gigId: String(gig._id), price: booking.price,
        });
        logger.event("transaction_created", {
            req, bookingId: String(booking._id), transactionId: String(transaction._id), amount: transaction.amount,
        });

        return res.status(201).json({
            message: "Booking confirmed.",
            booking: formatBooking(booking),
            transaction: {
                id: transaction._id,
                amount: transaction.amount,
                status: transaction.status,
            },
        });
    } catch (error) {
        logger.unexpected(req, "create_booking", error);

        return res.status(500).json({
            message: "An unexpected error occurred.",
        });
    }
}

async function listMyBookings(req, res) {
    const filter =
        req.user.role === "freelancer"
            ? { freelancer: req.user.id }
            : { client: req.user.id };

    try {
        const bookings = await Booking.find(filter)
            .sort({ createdAt: -1 })
            .limit(100)
            .populate("gig", "title");

        return res.status(200).json({
            bookings: bookings.map(formatBooking),
        });
    } catch (error) {
        logger.unexpected(req, "list_bookings", error);

        return res.status(500).json({
            message: "An unexpected error occurred.",
        });
    }
}

async function getMyBooking(req, res, next) {
    const participant = req.user.role === "freelancer"
        ? { freelancer: req.user.id }
        : { client: req.user.id };
    try {
        const booking = await Booking.findOne({ _id: req.params.id, ...participant })
            .populate("gig", "title");
        if (!booking) return res.status(404).json({ message: "Booking not found." });
        const transaction = await Transaction.findOne({ booking: booking._id, ...participant });
        return res.json({
            booking: formatBooking(booking),
            transaction: transaction ? {
                id: transaction._id, amount: transaction.amount, status: transaction.status,
            } : null,
        });
    } catch (error) {
        return next(error);
    }
}

async function cancelBooking(req, res, next) {
    const participant = req.user.role === "freelancer"
        ? { freelancer: req.user.id }
        : { client: req.user.id };

    try {
        const booking = await Booking.findOne({ _id: req.params.id, ...participant });

        if (!booking) {
            return res.status(404).json({ message: "Booking not found." });
        }

        if (booking.status === "cancelled") {
            return res.status(409).json({ message: "Booking is already cancelled." });
        }

        booking.status = "cancelled";
        await booking.save();

        await Transaction.deleteOne({ booking: booking._id });

        logger.event("booking_cancelled", { req, bookingId: String(booking._id), transactionRemoved: true });

        return res.status(200).json({
            message: "Booking cancelled.",
            booking: formatBooking(booking),
        });
    } catch (error) {
        return next(error);
    }
}

module.exports = { createBooking, listMyBookings, getMyBooking, cancelBooking };
