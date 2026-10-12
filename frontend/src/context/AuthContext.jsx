import { createContext, useContext, useState } from "react";
import apiClient from "../api/client";
import { getErrorMessage } from "../api/errorMessage";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem("user");
    return stored ? JSON.parse(stored) : null;
  });
  const [token, setToken] = useState(() => localStorage.getItem("token"));
  const [error, setError] = useState(null);

  async function register(username, password, role) {
    setError(null);
    try {
      const response = await apiClient.post("/auth/register", {
        username,
        password,
        role,
      });
      return response.data;
    } catch (err) {
      const message = getErrorMessage(err, "Registration failed. Please try again.");
      setError(message);
      throw new Error(message);
    }
  }

  async function login(username, password) {
    setError(null);
    try {
      const response = await apiClient.post("/auth/login", {
        username,
        password,
      });
      const { token: newToken, user: loggedInUser } = response.data;
      localStorage.setItem("token", newToken);
      localStorage.setItem("user", JSON.stringify(loggedInUser));
      setToken(newToken);
      setUser(loggedInUser);
      return loggedInUser;
    } catch (err) {
      const message = getErrorMessage(err, "Login failed. Please try again.");
      setError(message);
      throw new Error(message);
    }
  }

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setToken(null);
    setUser(null);
  }

  const value = {
    user,
    token,
    isAuthenticated: Boolean(token),
    error,
    register,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
