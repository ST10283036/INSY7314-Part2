const mongoose = require("mongoose");
const Transaction = require("../models/Transaction");

async function getIncome(req, res) {
    try {
        const freelancerId = new mongoose.Types.ObjectId(req.user.id);

        const [summary] = await Transaction.aggregate([
            { $match: { freelancer: freelancerId, status: "completed" } },
            {
                $group: {
                    _id: null,
                    totalIncome: { $sum: "$amount" },
                    transactionCount: { $sum: 1 },
                },
            },
        ]);

        const recent = await Transaction.find({ freelancer: req.user.id })
            .sort({ createdAt: -1 })
            .limit(20);

        return res.status(200).json({
            totalIncome: summary
                ? Math.round(summary.totalIncome * 100) / 100
                : 0,
            transactionCount: summary ? summary.transactionCount : 0,
            recentTransactions: recent.map((transaction) => ({
                id: transaction._id,
                booking: transaction.booking,
                amount: transaction.amount,
                status: transaction.status,
                createdAt: transaction.createdAt,
            })),
        });
    } catch (error) {
        console.error("Get income failed unexpectedly:");

        return res.status(500).json({
            message: "An unexpected error occurred.",
        });
    }
}

module.exports = { getIncome };
