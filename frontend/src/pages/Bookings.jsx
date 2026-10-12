import { useEffect, useState } from "react";
import apiClient from "../api/client";
import { useAuth } from "../context/AuthContext";

export default function Bookings() {
  const { user } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailError, setDetailError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function fetchBookings() {
      try {
        const response = await apiClient.get("/bookings/mine");
        if (!cancelled) {
          setBookings(response.data.bookings);
        }
      } catch {
        if (!cancelled) {
          setError("Could not load bookings. Please try again later.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchBookings();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleToggleDetail(booking) {
    if (expandedId === booking.id) {
      setExpandedId(null);
      setDetail(null);
      setDetailError("");
      return;
    }

    setExpandedId(booking.id);
    setDetail(null);
    setDetailError("");

    try {
      const response = await apiClient.get(`/bookings/${booking.id}`);
      setDetail(response.data);
    } catch {
      setDetailError("Could not load booking details.");
    }
  }

  if (loading) return <div className="page">Loading bookings...</div>;
  if (error) return <div className="page form-error">{error}</div>;

  return (
    <div className="page">
      <h1>My Bookings</h1>
      <p className="gig-freelancer">
        {user?.role === "freelancer"
          ? "Gigs clients have booked from you."
          : "Gigs you have booked."}
      </p>

      {bookings.length === 0 ? (
        <p>No bookings yet.</p>
      ) : (
        <div className="gig-grid">
          {bookings.map((booking) => (
            <div key={booking.id} className="gig-card">
              <h2>{booking.gig?.title ?? "Gig"}</h2>
              <p className="gig-price">R{booking.price}</p>
              <p>
                Status: <strong>{booking.status}</strong>
              </p>
              <p className="gig-freelancer">
                Booked {new Date(booking.createdAt).toLocaleDateString()}
              </p>
              <div className="gig-actions">
                <button onClick={() => handleToggleDetail(booking)}>
                  {expandedId === booking.id ? "Hide details" : "View details"}
                </button>
              </div>
              {expandedId === booking.id && (
                <div className="booking-detail">
                  {detailError && <p className="form-error">{detailError}</p>}
                  {!detailError && !detail && <p>Loading...</p>}
                  {detail?.transaction && (
                    <p>
                      Transaction: R{detail.transaction.amount} —{" "}
                      {detail.transaction.status}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
