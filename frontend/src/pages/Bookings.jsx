import { useEffect, useState } from "react";
import apiClient from "../api/client";
import { getErrorMessage } from "../api/errorMessage";
import { useAuth } from "../context/AuthContext";

export default function Bookings() {
  const { user } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailError, setDetailError] = useState("");
  const [cancellingId, setCancellingId] = useState(null);
  const [cancelError, setCancelError] = useState("");

  async function fetchBookings() {
    try {
      const response = await apiClient.get("/bookings/mine");
      setBookings(response.data.bookings);
    } catch {
      setError("Could not load bookings. Please try again later.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchBookings();
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

  async function handleCancel(booking) {
    if (!window.confirm(`Cancel the booking for "${booking.gig?.title ?? "this gig"}"?`)) {
      return;
    }
    setCancelError("");
    setCancellingId(booking.id);
    try {
      await apiClient.patch(`/bookings/${booking.id}/cancel`, {});
      await fetchBookings();
      if (expandedId === booking.id) {
        setExpandedId(null);
        setDetail(null);
      }
    } catch (err) {
      setCancelError(getErrorMessage(err, "Could not cancel this booking."));
    } finally {
      setCancellingId(null);
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
      {cancelError && <p className="form-error">{cancelError}</p>}

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
                {booking.status === "confirmed" && (
                  <button
                    className="danger"
                    onClick={() => handleCancel(booking)}
                    disabled={cancellingId === booking.id}
                  >
                    {cancellingId === booking.id ? "Cancelling..." : "Cancel"}
                  </button>
                )}
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
