import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Login from "../pages/Login";
import { useAuth } from "../context/AuthContext";

vi.mock("../context/AuthContext", () => ({
  useAuth: vi.fn(),
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

function renderLogin() {
  return render(
    <MemoryRouter>
      <Login />
    </MemoryRouter>
  );
}

describe("Login page", () => {
  beforeEach(() => {
    mockNavigate.mockReset();
  });

  it("renders username and password fields and a submit button", () => {
    useAuth.mockReturnValue({ login: vi.fn() });
    renderLogin();
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /log in/i })).toBeInTheDocument();
  });

  it("calls login with entered credentials and navigates to /gigs on success", async () => {
    const loginMock = vi.fn().mockResolvedValue();
    useAuth.mockReturnValue({ login: loginMock });
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText(/username/i), "testuser");
    await user.type(screen.getByLabelText(/password/i), "Password1!");
    await user.click(screen.getByRole("button", { name: /log in/i }));

    await waitFor(() => {
      expect(loginMock).toHaveBeenCalledWith("testuser", "Password1!");
    });
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/gigs");
    });
  });

  it("shows an error message when login fails", async () => {
    const loginMock = vi.fn().mockRejectedValue(new Error("Invalid username or password."));
    useAuth.mockReturnValue({ login: loginMock });
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText(/username/i), "baduser");
    await user.type(screen.getByLabelText(/password/i), "wrongpass");
    await user.click(screen.getByRole("button", { name: /log in/i }));

    expect(await screen.findByText("Invalid username or password.")).toBeInTheDocument();
  });
});
