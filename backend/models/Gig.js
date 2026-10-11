const mongoose = require("mongoose");

const gigSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: true,
            trim: true,
            minlength: 3,
            maxlength: 100,
        },
        description: {
            type: String,
            required: true,
            trim: true,
            maxlength: 1000,
        },
        price: {
            type: Number,
            required: true,
            min: 1,
        },
        freelancer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        isAvailable: {
            type: Boolean,
            default: true,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("Gig", gigSchema);