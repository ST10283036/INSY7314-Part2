import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import Gigs from "../pages/Gigs";
import apiClient from "../api/client";

vi.mock("../api/client", () => ({
  default: {
    get: vi.fn(),
  },
}));

describe("Gigs page", () => {
  beforeEach(() => {
    apiClient.get.mockReset();
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
});
