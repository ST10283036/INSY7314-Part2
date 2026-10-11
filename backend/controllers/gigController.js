const Gig = require("../models/Gig");

function formatGig(gig) {
    return {
        id: gig._id,
        title: gig.title,
        description: gig.description,
        price: gig.price,
        freelancer: gig.freelancer,
        isAvailable: gig.isAvailable,
        createdAt: gig.createdAt,
    };
}

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
            gig: formatGig(gig),
        });
    } catch (error) {
        console.error("Create gig failed unexpectedly:", error.message);

        return res.status(500).json({
            message: "An unexpected error occured.",
        });
    }
}

async function listAvailableGigs(req, res) {
    try {
        const gigs = await Gig.find({ isAvailable: true })
            .sort({ createdAt: -1 })
            .limit(100)
            .populate("freelancer", "username");

        return res.status(200).json({ gigs: gigs.map(formatGig) });
    } catch (error) {
        console.error("List gigs failed unexpectedly:", error.message);

        return res.status(500).json({
            message: "An unexpected error occured.",
        });
    }
}

async function listMyGigs(req, res) {
    try {
        const gigs = await Gig.find({ freelancer: req.user.id })
            .sort({ createdAt: -1 })
            .limit(100);

        return res.status(200).json({ gigs: gigs.map(formatGig) });
    } catch (error) {
        console.error("List my gigs failed unexpectedly:", error.message);

        return res.status(500).json({
            message: "An unexpected error occurred.",
        });
    }
}

async function getGigById(req, res) {
    try {
        const gig = await Gig.findById(req.params.id).populate(
            "freelancer",
            "username"
        );

        const isOwner = 
            gig && gig.freelancer._id.toString() === req.user.id;

        if (!gig || (!gig.isAvailable && !isOwner)) {
            return res.status(404).json({ message: "Gig not found." });
        }

        return res.status(200).json({ gig: formatGig(gig) });
    } catch (error) {
        console.error("Get gig failed unexpectedly:", error.message);

        return res.status(500).json({
            messsage: "An unexpected error occured.",
        });
    }
}

async function updateGig(req, res) {
    const updatableFields = ["title", "description", "price", "isAvailable"];
    const updates = {};

    for (const field of updatableFields) {
        if (req.body[field] !== undefined) {
            updates[field] = req.body[field];
        }
    }
    
    try {
        const gig = await Gig.findOneAndUpdate(
            { _id: req.params.id, freelancer: req.user.id },
            { $set: updates },
            { new: true, runValidators: true }
        );

        if (!gig) {
            return res.status(404).json({ message: "Gig not found." });
        }

        return res.status(200).json({
            message: "Gig updated successfully.",
            gig: formatGig(gig),
        });
    } catch (error) {
        console.error("Update gig failed unexpectedly:", error.message);

        return res.status(500).json({
            message: "An unexpected error occurred.",
        });
    }
}

async function deleteGig(req, res) {
    try {
        const gig = await Gig.findOneAndDelete({
            _id: req.params.id,
            freelancer: req.user.id,
        });

        if (!gig) {
            return res.status(404).json({ message: "Gig not found." });
        }

        return res.status(200).json({ message: "Gig deleted successfully." });
    } catch (error) {
        console.error("Delete gig failed unexpectedly:", error.message);

        returnres.status(500).json({
            message: "An unexpected error occurred.",
        });
    }
}

module.exports = { 
    createGig,
    listAvailableGigs,
    listMyGigs,
    getGigById,
    updateGig,
    deleteGig,
};