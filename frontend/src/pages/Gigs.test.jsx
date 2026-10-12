import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Gigs from "../pages/Gigs";
import apiClient from "../api/client";
import { useAuth } from "../context/AuthContext";

vi.mock("../api/client", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock("../context/AuthContext", () => ({
  useAuth: vi.fn(),
}));

describe("Gigs page", () => {
  beforeEach(() => {
    apiClient.get.mockReset();
    apiClient.post.mockReset();
    useAuth.mockReturnValue({ user: { username: "alice", role: "client" } });
  });

  it("shows a loading state initially", () => {
    apiClient.get.mockReturnValue(new Promise(() => {}));
    render(<Gigs />);
    expect(screen.getByText(/loading gigs/i)).toBeInTheDocument();
  });

  it("renders a list of gigs once loaded", async () => {
    apiClient.get.mockResolvedValue({
      data: {
        gigs: [
          {
            id: "1",
            title: "Logo Design",
            description: "I will design a logo",
            price: 500,
            freelancer: { username: "alice" },
          },
        ],
      },
    });
    render(<Gigs />);

    expect(await screen.findByText("Logo Design")).toBeInTheDocument();
    expect(screen.getByText("I will design a logo")).toBeInTheDocument();
    expect(screen.getByText("R500")).toBeInTheDocument();
    expect(screen.getByText(/by alice/i)).toBeInTheDocument();
  });

  it("shows a message when there are no gigs", async () => {
    apiClient.get.mockResolvedValue({ data: { gigs: [] } });
    render(<Gigs />);
    expect(await screen.findByText(/no gigs available right now/i)).toBeInTheDocument();
  });

  it("shows an error message when the request fails", async () => {
    apiClient.get.mockRejectedValue(new Error("Network error"));
    render(<Gigs />);
    expect(await screen.findByText(/could not load gigs/i)).toBeInTheDocument();
  });

  it("lets a client book a gig and shows a success message", async () => {
    apiClient.get.mockResolvedValue({
      data: {
        gigs: [
          {
            id: "1",
            title: "Logo Design",
            description: "I will design a logo",
            price: 500,
            freelancer: { username: "bob" },
          },
        ],
      },
    });
    apiClient.post.mockResolvedValue({ data: { message: "Booking confirmed." } });
    const user = userEvent.setup();
    render(<Gigs />);

    const bookButton = await screen.findByRole("button", { name: /^book$/i });
    await user.click(bookButton);

    expect(apiClient.post).toHaveBeenCalledWith("/bookings", { gigId: "1" });
    expect(
      await screen.findByText(/booked "logo design"/i)
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^book$/i })).not.toBeDisabled();
  });

  it("shows the server's message when booking a gig twice", async () => {
    apiClient.get.mockResolvedValue({
      data: {
        gigs: [
          {
            id: "1",
            title: "Logo Design",
            description: "I will design a logo",
            price: 500,
            freelancer: { username: "bob" },
          },
        ],
      },
    });
    apiClient.post.mockRejectedValue({
      response: { data: { message: "You already have an active booking for this gig." } },
    });
    const user = userEvent.setup();
    render(<Gigs />);

    const bookButton = await screen.findByRole("button", { name: /^book$/i });
    await user.click(bookButton);

    expect(
      await screen.findByText(/already have an active booking/i)
    ).toBeInTheDocument();
  });

  it("does not show a Book button for freelancers", async () => {
    useAuth.mockReturnValue({ user: { username: "bob", role: "freelancer" } });
    apiClient.get.mockResolvedValue({
      data: {
        gigs: [
          {
            id: "1",
            title: "Logo Design",
            description: "I will design a logo",
            price: 500,
            freelancer: { username: "bob" },
          },
        ],
      },
    });
    render(<Gigs />);

    await screen.findByText("Logo Design");
    expect(screen.queryByRole("button", { name: /book/i })).not.toBeInTheDocument();
  });
});
