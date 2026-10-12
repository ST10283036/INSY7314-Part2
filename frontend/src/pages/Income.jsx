import { useEffect, useState } from "react";
import apiClient from "../api/client";

export default function Income() {
  const [income, setIncome] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function fetchIncome() {
      try {
        const response = await apiClient.get("/income");
        if (!cancelled) {
          setIncome(response.data);
        }
      } catch {
        if (!cancelled) {
          setError("Could not load income. Please try again later.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchIncome();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <div className="page">Loading income...</div>;
  if (error) return <div className="page form-error">{error}</div>;

  return (
    <div className="page">
      <h1>Income</h1>

      <div className="gig-card income-summary">
        <p className="gig-price">R{income.totalIncome}</p>
        <p className="gig-freelancer">
          {income.transactionCount} completed transaction
          {income.transactionCount === 1 ? "" : "s"}
        </p>
      </div>

      <h2>Recent transactions</h2>
      {income.recentTransactions.length === 0 ? (
        <p>No transactions yet.</p>
      ) : (
        <div className="gig-grid">
          {income.recentTransactions.map((transaction) => (
            <div key={transaction.id} className="gig-card">
              <p className="gig-price">R{transaction.amount}</p>
              <p>
                Status: <strong>{transaction.status}</strong>
              </p>
              <p className="gig-freelancer">
                {new Date(transaction.createdAt).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
