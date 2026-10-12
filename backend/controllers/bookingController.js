const Gig = require("../models/Gig");
const Booking = require("../models/Booking");
const Transaction = require("../models/Transaction");

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
            throw error;
        }
        
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
        console.error("Create booking failed unexpectedly:", error.message);

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
        console.error("List bookings failed unexpectedly:", error.message);

        return res.status(500).json({
            message: "An unexpected error occurred.",
        });
    }
}

module.exports = { createBooking, listMyBookings };