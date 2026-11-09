const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
    TAX_TABLES,
    getTaxYearBounds,
    getTaxTable,
    calculateIncomeTax,
    buildMonthlyIncome,
} = require("../utils/tax");

const table = getTaxTable(2026);

test("tax matches the SARS published bracket boundaries before rebate", () => {
    // Cumulative tax at the top of each bracket, as printed in the SARS table.
    const published = [
        [245100, 44118],
        [383100, 79998],
        [530200, 125599],
        [695800, 185215],
        [887000, 259783],
        [1878600, 666339],
    ];
    for (const [income, expected] of published) {
        assert.equal(calculateIncomeTax(income, table).taxBeforeRebate, expected, `income ${income}`);
    }
});

test("the primary rebate is deducted and income under the threshold pays nothing", () => {
    assert.equal(calculateIncomeTax(99000, table).tax, 0);
    assert.equal(calculateIncomeTax(50000, table).tax, 0);
    assert.equal(calculateIncomeTax(245100, table).tax, 44118 - 17820);
    assert.equal(calculateIncomeTax(99001, table).tax, 0.18);
});

test("a typical freelancer income is taxed progressively", () => {
    // 300,000: 44,118 + 26% of 54,900 = 58,392.00, less the 17,820 rebate.
    const result = calculateIncomeTax(300000, table);
    assert.equal(result.taxBeforeRebate, 58392);
    assert.equal(result.rebate, 17820);
    assert.equal(result.tax, 40572);
    assert.equal(result.effectiveRate, 0.1352);
});

test("invalid, negative and zero income produce zero tax", () => {
    for (const value of [0, -500, NaN, Infinity, undefined, null, "100"]) {
        const result = calculateIncomeTax(value, table);
        assert.equal(result.tax, 0, `value ${String(value)}`);
        assert.equal(result.effectiveRate, 0);
    }
});

test("the per-bracket breakdown adds up to the tax before rebate", () => {
    for (const income of [1, 99000, 245100.5, 300000, 600000, 2000000]) {
        const result = calculateIncomeTax(income, table);
        const summed = result.breakdown.reduce((sum, row) => sum + row.tax, 0);
        assert.ok(Math.abs(summed - result.taxBeforeRebate) < 0.05, `income ${income}`);
        assert.equal(result.breakdown.length, table.brackets.length);
    }
});

test("results are rounded to two decimal places", () => {
    const result = calculateIncomeTax(123456.789, table);
    for (const key of ["taxableIncome", "taxBeforeRebate", "rebate", "tax"]) {
        assert.equal(result[key], Math.round(result[key] * 100) / 100, key);
    }
});

test("the tax year starts on 1 March at midnight South African time", () => {
    const inYear = getTaxYearBounds(new Date("2026-11-09T10:00:00Z"));
    assert.equal(inYear.label, "2026/27");
    assert.equal(inYear.start.toISOString(), "2026-02-28T22:00:00.000Z");
    assert.equal(inYear.end.toISOString(), "2027-02-28T22:00:00.000Z");

    assert.equal(getTaxYearBounds(new Date("2026-02-28T22:00:00Z")).label, "2026/27");
    assert.equal(getTaxYearBounds(new Date("2026-02-28T21:59:59Z")).label, "2025/26");
    assert.equal(getTaxYearBounds(new Date("2027-02-28T21:59:59Z")).label, "2026/27");
    assert.equal(getTaxYearBounds(new Date("2027-02-28T22:00:00Z")).label, "2027/28");
    assert.equal(getTaxYearBounds(new Date("2027-01-15T12:00:00Z")).startYear, 2026);
});

test("a tax year without a published table falls back to the latest one", () => {
    assert.equal(getTaxTable(2030).startYear, Math.max(...Object.keys(TAX_TABLES).map(Number)));
    assert.equal(getTaxTable(2026).startYear, 2026);
});

test("monthly income covers twelve months from March and fills gaps with zero", () => {
    const taxYear = getTaxYearBounds(new Date("2026-11-09T10:00:00Z"));
    const months = buildMonthlyIncome(taxYear, [
        { _id: "2026-03", total: 100.456 },
        { _id: "2027-02", total: 50 },
        { _id: "2026-11", total: 0.1 + 0.2 },
    ]);
    assert.equal(months.length, 12);
    assert.equal(months[0].month, "2026-03");
    assert.equal(months[0].total, 100.46);
    assert.equal(months[9].month, "2026-12");
    assert.equal(months[11].month, "2027-02");
    assert.equal(months[11].total, 50);
    assert.equal(months.find((m) => m.month === "2026-11").total, 0.3);
    assert.equal(months.find((m) => m.month === "2026-07").total, 0);
});
