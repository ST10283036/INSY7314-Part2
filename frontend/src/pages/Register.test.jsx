import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Register from "../pages/Register";
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

function renderRegister() {
  return render(
    <MemoryRouter>
      <Register />
    </MemoryRouter>
  );
}

describe("Register page", () => {
  beforeEach(() => {
    mockNavigate.mockReset();
  });

  it("renders username, password, role fields and a submit button", () => {
    useAuth.mockReturnValue({ register: vi.fn() });
    renderRegister();
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/i am a/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /register/i })).toBeInTheDocument();
  });

  it("defaults role to client and allows switching to freelancer", async () => {
    useAuth.mockReturnValue({ register: vi.fn() });
    const user = userEvent.setup();
    renderRegister();

    const roleSelect = screen.getByLabelText(/i am a/i);
    expect(roleSelect.value).toBe("client");

    await user.selectOptions(roleSelect, "freelancer");
    expect(roleSelect.value).toBe("freelancer");
  });

  it("calls register with username, password and selected role, then shows success message", async () => {
    const registerMock = vi.fn().mockResolvedValue();
    useAuth.mockReturnValue({ register: registerMock });
    const user = userEvent.setup();
    renderRegister();

    await user.type(screen.getByLabelText(/username/i), "newfreelancer");
    await user.type(screen.getByLabelText(/password/i), "StrongPass1!");
    await user.selectOptions(screen.getByLabelText(/i am a/i), "freelancer");
    await user.click(screen.getByRole("button", { name: /register/i }));

    await waitFor(() => {
      expect(registerMock).toHaveBeenCalledWith("newfreelancer", "StrongPass1!", "freelancer");
    });
    expect(await screen.findByText(/account created/i)).toBeInTheDocument();
  });

  it("shows an error message when registration fails", async () => {
    const registerMock = vi.fn().mockRejectedValue(new Error("That username is already taken."));
    useAuth.mockReturnValue({ register: registerMock });
    const user = userEvent.setup();
    renderRegister();

    await user.type(screen.getByLabelText(/username/i), "existinguser");
    await user.type(screen.getByLabelText(/password/i), "StrongPass1!");
    await user.click(screen.getByRole("button", { name: /register/i }));

    expect(await screen.findByText("That username is already taken.")).toBeInTheDocument();
  });
});
