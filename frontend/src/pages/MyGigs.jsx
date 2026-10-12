import { useEffect, useState } from "react";
import apiClient from "../api/client";
import { getErrorMessage } from "../api/errorMessage";

export default function MyGigs() {
  const [gigs, setGigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function fetchMyGigs() {
    try {
      const response = await apiClient.get("/gigs/mine");
      setGigs(response.data.gigs);
    } catch {
      setError("Could not load your gigs.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchMyGigs();
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setFormError("");
    setSubmitting(true);
    try {
      await apiClient.post("/gigs", {
        title,
        description,
        price: Number(price),
      });
      setTitle("");
      setDescription("");
      setPrice("");
      await fetchMyGigs();
    } catch (err) {
      setFormError(getErrorMessage(err, "Could not create gig."));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleAvailable(gig) {
    try {
      await apiClient.put(`/gigs/${gig.id}`, {
        isAvailable: !gig.isAvailable,
      });
      await fetchMyGigs();
    } catch {
      setError("Could not update gig.");
    }
  }

  async function handleDelete(gig) {
    if (!window.confirm(`Delete "${gig.title}"?`)) return;
    try {
      await apiClient.delete(`/gigs/${gig.id}`);
      await fetchMyGigs();
    } catch {
      setError("Could not delete gig.");
    }
  }

  if (loading) return <div className="page">Loading your gigs...</div>;

  return (
    <div className="page">
      <h1>My Gigs</h1>

      <form onSubmit={handleCreate} className="auth-form gig-form">
        <h2>Create a new gig</h2>
        <label>
          Title
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </label>
        <label>
          Description
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />
        </label>
        <label>
          Price (ZAR)
          <input
            type="number"
            min="1"
            max="1000000"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            required
          />
        </label>
        {formError && <p className="form-error">{formError}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? "Creating..." : "Create Gig"}
        </button>
      </form>

      {error && <p className="form-error">{error}</p>}

      <h2>Your listings</h2>
      {gigs.length === 0 ? (
        <p>You have not created any gigs yet.</p>
      ) : (
        <div className="gig-grid">
          {gigs.map((gig) => (
            <div key={gig.id} className="gig-card">
              <h3>{gig.title}</h3>
              <p>{gig.description}</p>
              <p className="gig-price">R{gig.price}</p>
              <p>{gig.isAvailable ? "Available" : "Hidden"}</p>
              <div className="gig-actions">
                <button onClick={() => handleToggleAvailable(gig)}>
                  {gig.isAvailable ? "Hide" : "Show"}
                </button>
                <button onClick={() => handleDelete(gig)} className="danger">
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
