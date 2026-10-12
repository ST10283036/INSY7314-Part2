import { useEffect, useState } from "react";
import apiClient from "../api/client";

export default function Gigs() {
  const [gigs, setGigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  if (loading) return <div className="page">Loading gigs...</div>;
  if (error) return <div className="page form-error">{error}</div>;

  return (
    <div className="page">
      <h1>Browse Gigs</h1>
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
