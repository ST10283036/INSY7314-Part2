import { useEffect, useState } from "react";
import apiClient from "../api/client";

export default function AdminSummary() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function fetchSummary() {
      try {
        const response = await apiClient.get("/admin/summary");
        if (!cancelled) {
          setSummary(response.data);
        }
      } catch {
        if (!cancelled) {
          setError("Could not load the admin summary. Please try again later.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchSummary();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <div className="page">Loading summary...</div>;
  if (error) return <div className="page form-error">{error}</div>;

  const stats = [
    { label: "Users", value: summary.users },
    { label: "Gigs", value: summary.gigs },
    { label: "Bookings", value: summary.bookings },
    { label: "Transactions", value: summary.transactions },
  ];

  return (
    <div className="page">
      <h1>Admin Summary</h1>
      <p className="gig-freelancer">
        Platform-wide totals, visible to admin accounts only.
      </p>
      <div className="gig-grid">
        {stats.map((stat) => (
          <div key={stat.label} className="gig-card">
            <p className="gig-price">{stat.value}</p>
            <p className="gig-freelancer">{stat.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
