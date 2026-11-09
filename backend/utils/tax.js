"use strict";

// Estimated income tax for a South African freelancer.
//
// Rates are the individual income tax table for the SARS "2027 tax year"
// (1 March 2026 - 28 February 2027), published at
// https://www.sars.gov.za/tax-rates/income-tax/rates-of-tax-for-individuals/
//
// This is an ESTIMATE, not tax advice. See TAX_ASSUMPTIONS below.

// South Africa has no daylight saving, so a fixed UTC+2 offset is exact.
const SAST_OFFSET_HOURS = 2;
const SAST_OFFSET_MS = SAST_OFFSET_HOURS * 60 * 60 * 1000;
const SAST_OFFSET_TEXT = "+02:00";

// Keyed by the calendar year in which the tax year STARTS (1 March).
const TAX_TABLES = Object.freeze({
    2026: Object.freeze({
        // Annual brackets: a bracket covers taxable income above `from`, up to
        // and including `to` (null = no upper limit).
        brackets: Object.freeze([
            { from: 0, to: 245100, rate: 0.18 },
            { from: 245100, to: 383100, rate: 0.26 },
            { from: 383100, to: 530200, rate: 0.31 },
            { from: 530200, to: 695800, rate: 0.36 },
            { from: 695800, to: 887000, rate: 0.39 },
            { from: 887000, to: 1878600, rate: 0.41 },
            { from: 1878600, to: null, rate: 0.45 },
        ]),
        // Primary rebate (every individual). Secondary/tertiary rebates apply
        // to people aged 65+/75+ and are deliberately not modelled.
        primaryRebate: 17820,
    }),
});

const TAX_ASSUMPTIONS = Object.freeze([
    "Only income earned through HustleHub+ in the current tax year is counted; other income, expenses and deductions are not.",
    "Income is treated as the freelancer's taxable income for the year so far (it is not projected to a full year).",
    "The freelancer is an individual under 65, so only the primary rebate is applied (no medical or retirement credits).",
    "Provisional tax payments, VAT and other taxes are not modelled.",
    "This is an estimate for guidance only and is not tax advice.",
]);

function round2(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

function round4(value) {
    return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

// The SA tax year runs 1 March (00:00 SAST) to the end of February.
function getTaxYearBounds(now = new Date()) {
    const sast = new Date(now.getTime() + SAST_OFFSET_MS);
    const startYear = sast.getUTCMonth() >= 2
        ? sast.getUTCFullYear()
        : sast.getUTCFullYear() - 1;

    return {
        startYear,
        label: `${startYear}/${String((startYear + 1) % 100).padStart(2, "0")}`,
        start: new Date(Date.UTC(startYear, 2, 1) - SAST_OFFSET_MS),
        end: new Date(Date.UTC(startYear + 1, 2, 1) - SAST_OFFSET_MS),
    };
}

// Uses the table for that tax year, or the most recent published table if the
// year has not been added yet.
function getTaxTable(startYear) {
    if (TAX_TABLES[startYear]) {
        return { startYear, ...TAX_TABLES[startYear] };
    }
    const latest = Math.max(...Object.keys(TAX_TABLES).map(Number));
    return { startYear: latest, ...TAX_TABLES[latest] };
}

function calculateIncomeTax(income, table = getTaxTable(getTaxYearBounds().startYear)) {
    const taxable = Number.isFinite(income) && income > 0 ? income : 0;

    const breakdown = table.brackets.map((bracket) => {
        const upper = bracket.to === null ? Infinity : bracket.to;
        const taxableInBracket = Math.max(0, Math.min(taxable, upper) - bracket.from);

        return {
            from: bracket.from,
            to: bracket.to,
            rate: bracket.rate,
            taxableInBracket: round2(taxableInBracket),
            tax: round2(taxableInBracket * bracket.rate),
        };
    });

    const unroundedBeforeRebate = table.brackets.reduce((sum, bracket) => {
        const upper = bracket.to === null ? Infinity : bracket.to;
        return sum + Math.max(0, Math.min(taxable, upper) - bracket.from) * bracket.rate;
    }, 0);

    const taxBeforeRebate = round2(unroundedBeforeRebate);
    const rebate = round2(Math.min(table.primaryRebate, unroundedBeforeRebate));
    const tax = round2(Math.max(0, unroundedBeforeRebate - table.primaryRebate));

    return {
        taxableIncome: round2(taxable),
        taxBeforeRebate,
        rebate,
        tax,
        effectiveRate: taxable > 0 ? round4(tax / taxable) : 0,
        breakdown,
    };
}

// Twelve "YYYY-MM" buckets for the tax year (March first), zero-filled.
function buildMonthlyIncome(taxYear, monthlyTotals) {
    const totals = new Map(monthlyTotals.map((row) => [row._id, row.total]));

    return Array.from({ length: 12 }, (_, index) => {
        const monthIndex = 2 + index;
        const year = taxYear.startYear + Math.floor(monthIndex / 12);
        const month = (monthIndex % 12) + 1;
        const key = `${year}-${String(month).padStart(2, "0")}`;

        return { month: key, total: round2(totals.get(key) || 0) };
    });
}

module.exports = {
    SAST_OFFSET_TEXT,
    TAX_TABLES,
    TAX_ASSUMPTIONS,
    round2,
    getTaxYearBounds,
    getTaxTable,
    calculateIncomeTax,
    buildMonthlyIncome,
};
