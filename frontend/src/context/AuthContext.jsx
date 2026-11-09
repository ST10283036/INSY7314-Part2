import { useContext } from "react";
import { AuthState } from "./authState";

export function useAuth() {
  const context = useContext(AuthState);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
