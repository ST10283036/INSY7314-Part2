const Gig = require("../models/Gig");

async function createGig(req, res) {
    const { title, description, price } = req.body;

    try {
        const gig = await Gig.create({
            title,
            description,
            price,
            freelancer: req.user.id,
        });

        return res.status(201).json({
            message: "Gig created successfully.",
            gig: {
                id: gig._id,
                title: gig.title,
                description: gig.description,
                price: gig.price,
                freelancer: gig.freelancer,
                isAvailable: gig.isAvailable,
                createdAt: gig.createdAt,
            },
        });
    } catch (error) {
        console.error("Create gig failed unexpectedly:", error.message);

        return res.status(500).json({
            message: "An unexpected error occured.",
        });
    }
}

module.exports = { createGig };