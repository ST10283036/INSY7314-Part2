import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MyGigs from "../pages/MyGigs";
import apiClient from "../api/client";

vi.mock("../api/client", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

async function fillForm(user, { title = "Logo Design", description = "I will design a logo", price = "500" } = {}) {
  await user.type(screen.getByLabelText(/title/i), title);
  await user.type(screen.getByLabelText(/description/i), description);
  await user.type(screen.getByLabelText(/price/i), price);
}

describe("MyGigs page", () => {
  beforeEach(() => {
    apiClient.get.mockReset();
    apiClient.post.mockReset();
    apiClient.put.mockReset();
    apiClient.delete.mockReset();
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("shows a loading state initially", () => {
    apiClient.get.mockReturnValue(new Promise(() => {}));
    render(<MyGigs />);
    expect(screen.getByText(/loading your gigs/i)).toBeInTheDocument();
  });

  it("shows a message when there are no gigs yet", async () => {
    apiClient.get.mockResolvedValue({ data: { gigs: [] } });
    render(<MyGigs />);
    expect(await screen.findByText(/have not created any gigs/i)).toBeInTheDocument();
  });

  it("renders a list of the freelancer's gigs once loaded", async () => {
    apiClient.get.mockResolvedValue({
      data: {
        gigs: [
          { id: "1", title: "Logo Design", description: "I will design a logo", price: 500, isAvailable: true },
        ],
      },
    });
    render(<MyGigs />);

    expect(await screen.findByText("Logo Design")).toBeInTheDocument();
    expect(screen.getByText("R500")).toBeInTheDocument();
    expect(screen.getByText("Available")).toBeInTheDocument();
  });

  it("creates a gig and refreshes the list on success", async () => {
    apiClient.get.mockResolvedValue({ data: { gigs: [] } });
    apiClient.post.mockResolvedValue({ data: { gig: { id: "1" } } });
    const user = userEvent.setup();
    render(<MyGigs />);

    await screen.findByText(/have not created any gigs/i);
    await fillForm(user);
    await user.click(screen.getByRole("button", { name: /create gig/i }));

    expect(apiClient.post).toHaveBeenCalledWith("/gigs", {
      title: "Logo Design",
      description: "I will design a logo",
      price: 500,
    });
    expect(apiClient.get).toHaveBeenCalledTimes(2);
  });

  it("shows the specific field message when gig creation fails validation", async () => {
    apiClient.get.mockResolvedValue({ data: { gigs: [] } });
    apiClient.post.mockRejectedValue({
      response: {
        data: {
          message: "Validation failed.",
          errors: [
            { field: "description", message: "description must contain 10 to 1000 characters." },
          ],
        },
      },
    });
    const user = userEvent.setup();
    render(<MyGigs />);

    await screen.findByText(/have not created any gigs/i);
    await fillForm(user, { description: "test" });
    await user.click(screen.getByRole("button", { name: /create gig/i }));

    expect(
      await screen.findByText("description must contain 10 to 1000 characters.")
    ).toBeInTheDocument();
    expect(screen.queryByText("Validation failed.")).not.toBeInTheDocument();
  });

  it("falls back to a generic message when gig creation fails with no server response", async () => {
    apiClient.get.mockResolvedValue({ data: { gigs: [] } });
    apiClient.post.mockRejectedValue(new Error("Network error"));
    const user = userEvent.setup();
    render(<MyGigs />);

    await screen.findByText(/have not created any gigs/i);
    await fillForm(user);
    await user.click(screen.getByRole("button", { name: /create gig/i }));

    expect(await screen.findByText("Could not create gig.")).toBeInTheDocument();
  });

  it("toggles a gig's availability", async () => {
    apiClient.get.mockResolvedValue({
      data: {
        gigs: [
          { id: "1", title: "Logo Design", description: "I will design a logo", price: 500, isAvailable: true },
        ],
      },
    });
    apiClient.put.mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    render(<MyGigs />);

    await user.click(await screen.findByRole("button", { name: /^hide$/i }));

    expect(apiClient.put).toHaveBeenCalledWith("/gigs/1", { isAvailable: false });
  });

  it("deletes a gig after confirmation", async () => {
    apiClient.get.mockResolvedValue({
      data: {
        gigs: [
          { id: "1", title: "Logo Design", description: "I will design a logo", price: 500, isAvailable: true },
        ],
      },
    });
    apiClient.delete.mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    render(<MyGigs />);

    await user.click(await screen.findByRole("button", { name: /delete/i }));

    expect(window.confirm).toHaveBeenCalledWith('Delete "Logo Design"?');
    expect(apiClient.delete).toHaveBeenCalledWith("/gigs/1");
  });
});
