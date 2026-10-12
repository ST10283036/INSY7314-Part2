import { useEffect, useState } from "react";
import apiClient from "../api/client";
import { useAuth } from "../context/AuthContext";

export default function Gigs() {
  const { user } = useAuth();
  const [gigs, setGigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [bookingGigId, setBookingGigId] = useState(null);
  const [bookingError, setBookingError] = useState("");
  const [bookingSuccess, setBookingSuccess] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function fetchGigs() {
      try {
        const response = await apiClient.get("/gigs");
        if (!cancelled) {
          setGigs(response.data.gigs);
        }
      } catch {
        if (!cancelled) {
          setError("Could not load gigs. Please try again later.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchGigs();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleBook(gig) {
    setBookingError("");
    setBookingSuccess("");
    setBookingGigId(gig.id);
    try {
      await apiClient.post("/bookings", { gigId: gig.id });
      setBookingSuccess(
        `Booked "${gig.title}". View it in My Bookings.`
      );
    } catch (err) {
      setBookingError(
        err.response?.data?.message || "Could not book this gig."
      );
    } finally {
      setBookingGigId(null);
    }
  }

  if (loading) return <div className="page">Loading gigs...</div>;
  if (error) return <div className="page form-error">{error}</div>;

  return (
    <div className="page">
      <h1>Browse Gigs</h1>
      {bookingError && <p className="form-error">{bookingError}</p>}
      {bookingSuccess && <p className="form-success">{bookingSuccess}</p>}
      {gigs.length === 0 ? (
        <p>No gigs available right now.</p>
      ) : (
        <div className="gig-grid">
          {gigs.map((gig) => (
            <div key={gig.id} className="gig-card">
              <h2>{gig.title}</h2>
              <p>{gig.description}</p>
              <p className="gig-price">R{gig.price}</p>
              <p className="gig-freelancer">
                by {gig.freelancer?.username ?? "Unknown"}
              </p>
              {user?.role === "client" && (
                <div className="gig-actions">
                  <button
                    onClick={() => handleBook(gig)}
                    disabled={bookingGigId === gig.id}
                  >
                    {bookingGigId === gig.id ? "Booking..." : "Book"}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
