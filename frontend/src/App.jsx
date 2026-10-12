import { Routes, Route, Navigate } from "react-router-dom";
import Navbar from "./components/Navbar";
import ProtectedRoute from "./components/ProtectedRoute";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Gigs from "./pages/Gigs";
import MyGigs from "./pages/MyGigs";
import Bookings from "./pages/Bookings";
import Income from "./pages/Income";
import AdminSummary from "./pages/AdminSummary";
import "./App.css";

export default function App() {
  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/" element={<Navigate to="/gigs" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route
          path="/gigs"
          element={
            <ProtectedRoute>
              <Gigs />
            </ProtectedRoute>
          }
        />
        <Route
          path="/my-gigs"
          element={
            <ProtectedRoute requireRole="freelancer">
              <MyGigs />
            </ProtectedRoute>
          }
        />
        <Route
          path="/bookings"
          element={
            <ProtectedRoute>
              <Bookings />
            </ProtectedRoute>
          }
        />
        <Route
          path="/income"
          element={
            <ProtectedRoute requireRole="freelancer">
              <Income />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute requireRole="admin">
              <AdminSummary />
            </ProtectedRoute>
          }
        />
      </Routes>
    </>
  );
}
