import { useEffect, useState } from "react";
import apiClient from "../api/client";
import MonthlyIncomeChart from "../components/MonthlyIncomeChart";
import { money, percent, monthLabel } from "../utils/finance";

export default function Income() {
  const [income, setIncome] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [requestNumber, setRequestNumber] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function fetchIncome() {
      try {
        const response = await apiClient.get("/income");
        if (!cancelled) setIncome(response.data);
      } catch {
        if (!cancelled) setError("Could not load income. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchIncome();
    return () => { cancelled = true; };
  }, [requestNumber]);

  function refresh() {
    setError("");
    setLoading(true);
    setRequestNumber((value) => value + 1);
  }

  if (loading) return <div className="page" role="status">Loading income...</div>;
  if (error) return (
    <div className="page">
      <p className="form-error" role="alert">{error}</p>
      <button className="dashboard-button" onClick={refresh}>Try again</button>
    </div>
  );

  // Missing Part 3 fields must not be presented as a zero tax estimate.
  const hasTax = income?.taxYear && [income.taxYearIncome, income.estimatedTax,
    income.netIncome, income.effectiveTaxRate, income.taxBeforeRebate,
    income.taxRebate].every(Number.isFinite);
  const months = income?.monthlyIncome ?? [];
  const recent = income?.recentTransactions ?? [];

  return (
    <div className="page income-page">
      <div className="dashboard-heading">
        <div>
          <h1>Income &amp; tax</h1>
          <p className="dashboard-muted">Your earnings, with a tax estimate to help you plan.</p>
        </div>
        <button className="dashboard-button" onClick={refresh}>Refresh income</button>
      </div>

      {hasTax ? <>
        <p className="tax-year">Tax year {income.taxYear.label} · March–February · South African time</p>
        <div className="income-cards">
          <section className="income-card" aria-labelledby="income-label">
            <h2 id="income-label">Tax-year income</h2>
            <p className="income-value">{money(income.taxYearIncome)}</p>
            <p>Completed transactions this tax year</p>
          </section>
          <section className="income-card tax-card" aria-labelledby="tax-label">
            <h2 id="tax-label">Estimated income tax</h2>
            <p className="income-value">{money(income.estimatedTax)}</p>
            <p>Effective tax rate: {percent(income.effectiveTaxRate)}</p>
          </section>
          <section className="income-card net-card" aria-labelledby="net-label">
            <h2 id="net-label">Income after estimated tax</h2>
            <p className="income-value">{money(income.netIncome)}</p>
            <p>Income less estimated tax; not a payout balance</p>
          </section>
        </div>

        <section className="dashboard-panel" aria-labelledby="monthly-heading">
          <h2 id="monthly-heading">Monthly income</h2>
          <p className="dashboard-muted">Completed transaction totals (ZAR). Months without income are included.</p>
          <MonthlyIncomeChart months={months} />
          <details>
            <summary>View monthly amounts</summary>
            <div className="table-scroll">
              <table>
                <caption>Monthly income for tax year {income.taxYear.label}</caption>
                <thead><tr><th scope="col">Month</th><th scope="col">Income</th></tr></thead>
                <tbody>{months.map((row) => <tr key={row.month}>
                  <th scope="row">{monthLabel(row.month)}</th><td>{money(row.total)}</td>
                </tr>)}</tbody>
              </table>
            </div>
          </details>
        </section>

        <section className="dashboard-panel" aria-labelledby="calculation-heading">
          <h2 id="calculation-heading">How the estimate is calculated</h2>
          <p>Each part of your tax-year income is taxed at its bracket rate. The primary rebate is then deducted; the estimate cannot fall below zero.</p>
          <dl className="tax-calculation">
            <div><dt>Tax before rebate</dt><dd>{money(income.taxBeforeRebate)}</dd></div>
            <div><dt>Primary rebate applied</dt><dd>{money(income.taxRebate)}</dd></div>
            <div><dt>Estimated tax</dt><dd>{money(income.estimatedTax)}</dd></div>
          </dl>
          <details>
            <summary>View tax bracket breakdown</summary>
            <div className="table-scroll">
              <table>
                <caption>Progressive tax calculation before the rebate</caption>
                <thead><tr><th scope="col">Income band</th><th scope="col">Rate</th><th scope="col">Your income in band</th><th scope="col">Tax</th></tr></thead>
                <tbody>{(income.taxBreakdown ?? []).map((row) => <tr key={row.from}>
                  <th scope="row">Above {money(row.from)}{row.to === null ? " (no upper limit)" : ` to ${money(row.to)}`}</th>
                  <td>{percent(row.rate)}</td><td>{money(row.taxableInBracket)}</td><td>{money(row.tax)}</td>
                </tr>)}</tbody>
              </table>
            </div>
          </details>
          <aside className="tax-assumptions" aria-labelledby="assumptions-heading">
            <h3 id="assumptions-heading">Estimate only — not tax advice</h3>
            <ul>{(income.taxAssumptions ?? []).map((assumption, index) => <li key={index}>{assumption}</li>)}</ul>
          </aside>
        </section>
      </> : <p role="status">The tax estimate is unavailable. Check that the Part 3 backend is running.</p>}

      <section className="dashboard-panel" aria-labelledby="lifetime-heading">
        <h2 id="lifetime-heading">All-time income</h2>
        <p className="income-value">{money(income?.totalIncome)}</p>
        <p>{income?.transactionCount ?? 0} completed transaction{income?.transactionCount === 1 ? "" : "s"}</p>
        <p className="dashboard-muted">All-time income may differ from the current tax-year total.</p>
      </section>

      <h2>Recent transactions</h2>
      {recent.length === 0 ? <p>No transactions yet.</p> : (
        <div className="gig-grid">
          {recent.map((transaction) => (
            <div key={transaction.id} className="gig-card">
              <p className="gig-price">{money(transaction.amount)}</p>
              <p>Status: <strong>{transaction.status}</strong></p>
              <p className="gig-freelancer">{new Date(transaction.createdAt).toLocaleDateString("en-ZA", { timeZone: "Africa/Johannesburg" })}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
