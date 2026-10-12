import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Navbar() {
  const { isAuthenticated, user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <nav className="navbar">
      <Link to="/" className="navbar-brand">HustleHub+</Link>
      <div className="navbar-links">
        {isAuthenticated ? (
          <>
            {user?.role !== "admin" && <Link to="/gigs">Browse Gigs</Link>}
            {user?.role === "freelancer" && <Link to="/my-gigs">My Gigs</Link>}
            {user?.role !== "admin" && <Link to="/bookings">My Bookings</Link>}
            {user?.role === "freelancer" && <Link to="/income">Income</Link>}
            {user?.role === "admin" && <Link to="/admin">Admin Summary</Link>}
            <span className="navbar-user">{user?.username} ({user?.role})</span>
            <button onClick={handleLogout}>Log out</button>
          </>
        ) : (
          <>
            <Link to="/login">Log in</Link>
            <Link to="/register">Register</Link>
          </>
        )}
      </div>
    </nav>
  );
}
