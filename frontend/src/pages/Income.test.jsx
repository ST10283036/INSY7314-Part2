import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Income from "../pages/Income";
import apiClient from "../api/client";

vi.mock("../api/client", () => ({
  default: {
    get: vi.fn(),
  },
}));

describe("Income page", () => {
  beforeEach(() => {
    apiClient.get.mockReset();
  });

  it("shows a loading state initially", () => {
    apiClient.get.mockReturnValue(new Promise(() => {}));
    render(<Income />);
    expect(screen.getByText(/loading income/i)).toBeInTheDocument();
  });

  it("renders the income summary and recent transactions once loaded", async () => {
    apiClient.get.mockResolvedValue({
      data: {
        totalIncome: 1500,
        transactionCount: 3,
        recentTransactions: [
          {
            id: "t1",
            booking: "b1",
            amount: 500,
            status: "completed",
            createdAt: "2026-10-01T00:00:00.000Z",
          },
        ],
      },
    });
    render(<Income />);

    expect(await screen.findByText(/R1\s500[.,]00/)).toBeInTheDocument();
    expect(screen.getByText(/3 completed transactions/i)).toBeInTheDocument();
    expect(screen.getByText(/R500[.,]00/)).toBeInTheDocument();
    expect(screen.getByText("completed")).toBeInTheDocument();
  });

  it("uses singular wording for exactly one transaction", async () => {
    apiClient.get.mockResolvedValue({
      data: { totalIncome: 500, transactionCount: 1, recentTransactions: [] },
    });
    render(<Income />);
    expect(await screen.findByText(/1 completed transaction$/i)).toBeInTheDocument();
  });

  it("shows a message when there are no transactions", async () => {
    apiClient.get.mockResolvedValue({
      data: { totalIncome: 0, transactionCount: 0, recentTransactions: [] },
    });
    render(<Income />);
    expect(await screen.findByText(/no transactions yet/i)).toBeInTheDocument();
  });

  it("shows an error message when the request fails", async () => {
    apiClient.get.mockRejectedValue(new Error("Network error"));
    render(<Income />);
    expect(await screen.findByText(/could not load income/i)).toBeInTheDocument();
  });
});

function dashboard(overrides = {}) {
  return {
    totalIncome: 350000, transactionCount: 4, recentTransactions: [],
    taxYear: { label: "2026/27", start: "2026-02-28T22:00:00Z", end: "2027-02-28T22:00:00Z" },
    taxYearIncome: 300000, estimatedTax: 40572, effectiveTaxRate: 0.1352,
    netIncome: 259428, taxBeforeRebate: 58392, taxRebate: 17820,
    monthlyIncome: Array.from({ length: 12 }, (_, i) => ({
      month: `${i < 10 ? 2026 : 2027}-${String((i + 2) % 12 + 1).padStart(2, "0")}`,
      total: i === 0 ? 300000 : 0,
    })),
    taxBreakdown: [
      { from: 0, to: 245100, rate: 0.18, taxableInBracket: 245100, tax: 44118 },
      { from: 245100, to: 383100, rate: 0.26, taxableInBracket: 54900, tax: 14274 },
      { from: 1878600, to: null, rate: 0.45, taxableInBracket: 0, tax: 0 },
    ],
    taxAssumptions: ["Only platform income is counted.", "No deductions or provisional tax payments are included."],
    ...overrides,
  };
}

describe("Part 3 income and tax dashboard", () => {
  beforeEach(() => apiClient.get.mockReset());

  async function show(data = dashboard()) {
    apiClient.get.mockResolvedValue({ data });
    render(<Income />);
    await screen.findByRole("heading", { name: "Income & tax" });
  }

  it("keeps current tax-year income separate from all-time income and shows the server's estimate", async () => {
    await show();
    expect(apiClient.get).toHaveBeenCalledWith("/income");
    expect(within(screen.getByRole("region", { name: "Tax-year income" })).getByText(/R300\s000[.,]00/)).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "All-time income" })).getByText(/R350\s000[.,]00/)).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Estimated income tax" })).getByText(/R40\s572[.,]00/)).toBeInTheDocument();
    expect(screen.getByText("Effective tax rate: 13.52%")).toBeInTheDocument();
    expect(screen.getByText(/R259\s428[.,]00/)).toBeInTheDocument();
    expect(screen.getByText(/Tax year 2026\/27/)).toBeInTheDocument();
  });

  it("shows all 12 months in tax-year order with an accessible chart and exact amounts", async () => {
    await show();
    expect(screen.getByRole("img", { name: /Monthly income in rand/ })).toBeInTheDocument();
    await userEvent.click(screen.getByText("View monthly amounts"));
    const rows = within(screen.getByRole("table", { name: /Monthly income for tax year/ })).getAllByRole("row");
    expect(rows).toHaveLength(13);
    expect(rows[1]).toHaveTextContent(/March 2026.*R300\s000[.,]00/);
    expect(rows[12]).toHaveTextContent(/February 2027.*R0[.,]00/);
  });

  it("opens bracket calculations and explains the rebate and assumptions", async () => {
    await show();
    await userEvent.click(screen.getByText("View tax bracket breakdown"));
    const table = screen.getByRole("table", { name: /Progressive tax calculation/ });
    expect(within(table).getByText("26.00%")).toBeInTheDocument();
    expect(within(table).getByText(/no upper limit/)).toBeInTheDocument();
    expect(screen.getByText(/R17\s820[.,]00/)).toBeInTheDocument();
    expect(screen.getByText("Only platform income is counted.")).toBeInTheDocument();
    expect(screen.getByText("Estimate only — not tax advice")).toBeInTheDocument();
  });

  it("shows zero income without invalid percentages or broken bars", async () => {
    const empty = dashboard();
    await show({ ...empty, taxYearIncome: 0, estimatedTax: 0, effectiveTaxRate: 0,
      netIncome: 0, taxBeforeRebate: 0, taxRebate: 0,
      monthlyIncome: empty.monthlyIncome.map((row) => ({ ...row, total: 0 })) });
    expect(screen.getByText("Effective tax rate: 0.00%")).toBeInTheDocument();
    expect(screen.getByText(/No income recorded in this tax year yet/)).toBeInTheDocument();
    expect(document.querySelectorAll(".income-bar")).toHaveLength(12);
    for (const bar of document.querySelectorAll(".income-bar")) expect(bar).toHaveAttribute("height", "0");
    expect(document.body.textContent).not.toMatch(/NaN|Infinity/);
  });

  it("does not silently display missing tax data as zero", async () => {
    await show({ totalIncome: 10, transactionCount: 1, recentTransactions: [] });
    expect(screen.getByText(/tax estimate is unavailable/)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Estimated income tax" })).not.toBeInTheDocument();
  });

  it("retries a failed request without displaying server internals", async () => {
    apiClient.get.mockRejectedValueOnce(new Error("secret database details"))
      .mockResolvedValueOnce({ data: dashboard() });
    render(<Income />);
    expect(await screen.findByRole("alert")).not.toHaveTextContent("secret database details");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Effective tax rate: 13.52%")).toBeInTheDocument();
    expect(apiClient.get).toHaveBeenCalledTimes(2);
  });

  it("refreshes the dashboard with newly received income", async () => {
    await show();
    apiClient.get.mockResolvedValueOnce({ data: dashboard({ totalIncome: 350010 }) });
    await userEvent.click(screen.getByRole("button", { name: "Refresh income" }));
    expect(await screen.findByText(/R350\s010[.,]00/)).toBeInTheDocument();
    expect(apiClient.get).toHaveBeenCalledTimes(2);
  });

  it("renders returned assumptions as text rather than executable HTML", async () => {
    await show(dashboard({ taxAssumptions: ['<img src=x onerror="alert(1)">'] }));
    expect(screen.getByText('<img src=x onerror="alert(1)">')).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });
});
