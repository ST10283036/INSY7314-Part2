import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import AdminSummary from "../pages/AdminSummary";
import apiClient from "../api/client";

vi.mock("../api/client", () => ({
  default: {
    get: vi.fn(),
  },
}));

describe("AdminSummary page", () => {
  beforeEach(() => {
    apiClient.get.mockReset();
  });

  it("shows a loading state initially", () => {
    apiClient.get.mockReturnValue(new Promise(() => {}));
    render(<AdminSummary />);
    expect(screen.getByText(/loading summary/i)).toBeInTheDocument();
  });

  it("renders the platform totals once loaded", async () => {
    apiClient.get.mockResolvedValue({
      data: { users: 12, gigs: 8, bookings: 5, transactions: 4 },
    });
    render(<AdminSummary />);

    expect(await screen.findByText("12")).toBeInTheDocument();
    expect(screen.getByText("Users")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.getByText("Gigs")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("Bookings")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("Transactions")).toBeInTheDocument();
  });

  it("shows an error message when the request fails", async () => {
    apiClient.get.mockRejectedValue(new Error("Network error"));
    render(<AdminSummary />);
    expect(
      await screen.findByText(/could not load the admin summary/i)
    ).toBeInTheDocument();
  });
});
