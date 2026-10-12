import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Bookings from "../pages/Bookings";
import apiClient from "../api/client";
import { useAuth } from "../context/AuthContext";

vi.mock("../api/client", () => ({
  default: {
    get: vi.fn(),
  },
}));

vi.mock("../context/AuthContext", () => ({
  useAuth: vi.fn(),
}));

describe("Bookings page", () => {
  beforeEach(() => {
    apiClient.get.mockReset();
    useAuth.mockReturnValue({ user: { username: "alice", role: "client" } });
  });

  it("shows a loading state initially", () => {
    apiClient.get.mockReturnValue(new Promise(() => {}));
    render(<Bookings />);
    expect(screen.getByText(/loading bookings/i)).toBeInTheDocument();
  });

  it("renders a list of bookings once loaded", async () => {
    apiClient.get.mockResolvedValue({
      data: {
        bookings: [
          {
            id: "b1",
            gig: { title: "Logo Design" },
            price: 500,
            status: "confirmed",
            createdAt: "2026-10-01T00:00:00.000Z",
          },
        ],
      },
    });
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
        return Promise.resolve({
          data: {
            bookings: [
              {
                id: "b1",
                gig: { title: "Logo Design" },
                price: 500,
                status: "confirmed",
                createdAt: "2026-10-01T00:00:00.000Z",
              },
            ],
          },
        });
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
});
