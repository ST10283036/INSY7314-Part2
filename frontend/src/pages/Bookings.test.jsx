import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Bookings from "../pages/Bookings";
import apiClient from "../api/client";
import { useAuth } from "../context/AuthContext";

vi.mock("../api/client", () => ({
  default: {
    get: vi.fn(),
    patch: vi.fn(),
  },
}));

vi.mock("../context/AuthContext", () => ({
  useAuth: vi.fn(),
}));

function confirmedBooking(overrides = {}) {
  return {
    id: "b1",
    gig: { title: "Logo Design" },
    price: 500,
    status: "confirmed",
    createdAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("Bookings page", () => {
  beforeEach(() => {
    apiClient.get.mockReset();
    apiClient.patch.mockReset();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    useAuth.mockReturnValue({ user: { username: "alice", role: "client" } });
  });

  it("shows a loading state initially", () => {
    apiClient.get.mockReturnValue(new Promise(() => {}));
    render(<Bookings />);
    expect(screen.getByText(/loading bookings/i)).toBeInTheDocument();
  });

  it("renders a list of bookings once loaded", async () => {
    apiClient.get.mockResolvedValue({ data: { bookings: [confirmedBooking()] } });
    render(<Bookings />);

    expect(await screen.findByText("Logo Design")).toBeInTheDocument();
    expect(screen.getByText("R500")).toBeInTheDocument();
    expect(screen.getByText("confirmed")).toBeInTheDocument();
  });

  it("shows a message when there are no bookings", async () => {
    apiClient.get.mockResolvedValue({ data: { bookings: [] } });
    render(<Bookings />);
    expect(await screen.findByText(/no bookings yet/i)).toBeInTheDocument();
  });

  it("shows an error message when the list request fails", async () => {
    apiClient.get.mockRejectedValue(new Error("Network error"));
    render(<Bookings />);
    expect(await screen.findByText(/could not load bookings/i)).toBeInTheDocument();
  });

  it("loads and shows transaction details when expanded", async () => {
    apiClient.get.mockImplementation((url) => {
      if (url === "/bookings/mine") {
        return Promise.resolve({ data: { bookings: [confirmedBooking()] } });
      }
      if (url === "/bookings/b1") {
        return Promise.resolve({
          data: {
            booking: { id: "b1" },
            transaction: { id: "t1", amount: 500, status: "completed" },
          },
        });
      }
      return Promise.reject(new Error("unexpected url"));
    });

    const user = userEvent.setup();
    render(<Bookings />);

    await screen.findByText("Logo Design");
    await user.click(screen.getByRole("button", { name: /view details/i }));

    expect(await screen.findByText(/transaction: r500/i)).toBeInTheDocument();
  });

  it("shows a role-appropriate description for freelancers", async () => {
    useAuth.mockReturnValue({ user: { username: "bob", role: "freelancer" } });
    apiClient.get.mockResolvedValue({ data: { bookings: [] } });
    render(<Bookings />);
    expect(
      await screen.findByText(/gigs clients have booked from you/i)
    ).toBeInTheDocument();
  });

  it("shows a Cancel button only for confirmed bookings", async () => {
    apiClient.get.mockResolvedValue({
      data: {
        bookings: [
          confirmedBooking({ id: "b1" }),
          confirmedBooking({ id: "b2", status: "cancelled" }),
        ],
      },
    });
    render(<Bookings />);

    await screen.findAllByText("Logo Design");
    expect(screen.getAllByRole("button", { name: /^cancel$/i })).toHaveLength(1);
  });

  it("cancels a booking after confirming, and refreshes the list", async () => {
    apiClient.get
      .mockResolvedValueOnce({ data: { bookings: [confirmedBooking()] } })
      .mockResolvedValueOnce({
        data: { bookings: [confirmedBooking({ status: "cancelled" })] },
      });
    apiClient.patch.mockResolvedValue({
      data: { message: "Booking cancelled.", booking: confirmedBooking({ status: "cancelled" }) },
    });

    const user = userEvent.setup();
    render(<Bookings />);

    await screen.findByText("Logo Design");
    await user.click(screen.getByRole("button", { name: /^cancel$/i }));

    expect(window.confirm).toHaveBeenCalled();
    expect(apiClient.patch).toHaveBeenCalledWith("/bookings/b1/cancel", {});
    expect(await screen.findByText("cancelled")).toBeInTheDocument();
  });

  it("does not cancel when the confirmation dialog is declined", async () => {
    window.confirm.mockReturnValue(false);
    apiClient.get.mockResolvedValue({ data: { bookings: [confirmedBooking()] } });

    const user = userEvent.setup();
    render(<Bookings />);

    await screen.findByText("Logo Design");
    await user.click(screen.getByRole("button", { name: /^cancel$/i }));

    expect(apiClient.patch).not.toHaveBeenCalled();
  });

  it("shows an error message when cancelling fails", async () => {
    apiClient.get.mockResolvedValue({ data: { bookings: [confirmedBooking()] } });
    apiClient.patch.mockRejectedValue({
      response: { data: { message: "Booking is already cancelled." } },
    });

    const user = userEvent.setup();
    render(<Bookings />);

    await screen.findByText("Logo Design");
    await user.click(screen.getByRole("button", { name: /^cancel$/i }));

    expect(
      await screen.findByText(/booking is already cancelled/i)
    ).toBeInTheDocument();
  });
});
