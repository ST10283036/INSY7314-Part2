import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
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

    expect(await screen.findByText("R1500")).toBeInTheDocument();
    expect(screen.getByText(/3 completed transactions/i)).toBeInTheDocument();
    expect(screen.getByText("R500")).toBeInTheDocument();
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
