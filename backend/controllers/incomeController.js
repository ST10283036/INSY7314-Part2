const mongoose = require("mongoose");
const logger = require("../utils/logger");
const Transaction = require("../models/Transaction");
const {
    SAST_OFFSET_TEXT,
    TAX_ASSUMPTIONS,
    round2,
    getTaxYearBounds,
    getTaxTable,
    calculateIncomeTax,
    buildMonthlyIncome,
} = require("../utils/tax");

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

        const taxYear = getTaxYearBounds();
        const monthlyTotals = await Transaction.aggregate([
            {
                $match: {
                    freelancer: freelancerId,
                    status: "completed",
                    createdAt: { $gte: taxYear.start, $lt: taxYear.end },
                },
            },
            {
                $group: {
                    _id: {
                        $dateToString: {
                            format: "%Y-%m",
                            date: "$createdAt",
                            timezone: SAST_OFFSET_TEXT,
                        },
                    },
                    total: { $sum: "$amount" },
                },
            },
        ]);

        const monthlyIncome = buildMonthlyIncome(taxYear, monthlyTotals);
        const taxYearIncome = round2(
            monthlyIncome.reduce((sum, month) => sum + month.total, 0)
        );
        const tax = calculateIncomeTax(
            taxYearIncome,
            getTaxTable(taxYear.startYear)
        );

        const recent = await Transaction.find({ freelancer: req.user.id })
            .sort({ createdAt: -1 })
            .limit(20);

        return res.status(200).json({
            totalIncome: summary
                ? Math.round(summary.totalIncome * 100) / 100
                : 0,
            transactionCount: summary ? summary.transactionCount : 0,
            taxYear: {
                label: taxYear.label,
                start: taxYear.start,
                end: taxYear.end,
            },
            taxYearIncome,
            estimatedTax: tax.tax,
            effectiveTaxRate: tax.effectiveRate,
            netIncome: round2(taxYearIncome - tax.tax),
            taxBeforeRebate: tax.taxBeforeRebate,
            taxRebate: tax.rebate,
            taxBreakdown: tax.breakdown,
            monthlyIncome,
            taxAssumptions: TAX_ASSUMPTIONS,
            recentTransactions: recent.map((transaction) => ({
                id: transaction._id,
                booking: transaction.booking,
                amount: transaction.amount,
                status: transaction.status,
                createdAt: transaction.createdAt,
            })),
        });
    } catch (error) {
        logger.unexpected(req, "get_income", error);

        return res.status(500).json({
            message: "An unexpected error occurred.",
        });
    }
}

module.exports = { getIncome };
