import { money, monthLabel } from "../utils/finance";

export default function MonthlyIncomeChart({ months }) {
  const maximum = Math.max(0, ...months.map((row) => Number.isFinite(row.total) ? row.total : 0));
  if (months.length === 0) return <p>Monthly income is unavailable.</p>;
  const slot = 660 / months.length;
  return (
    <>
      {maximum === 0 && <p>No income recorded in this tax year yet.</p>}
      <svg className="income-chart" viewBox="0 0 760 240" role="img" aria-label="Monthly income in rand, March to February. Exact amounts are in the monthly amounts table.">
        <line x1="70" y1="195" x2="740" y2="195" className="chart-axis" />
        <line x1="70" y1="35" x2="740" y2="35" className="chart-grid" />
        <text x="5" y="25" className="chart-label">{money(maximum)}</text>
        <text x="30" y="200" className="chart-label">R0</text>
        {months.map((row, index) => {
          const height = maximum > 0 && Number.isFinite(row.total) ? Math.max(0, row.total) / maximum * 160 : 0;
          const x = 75 + index * slot;
          return <g key={row.month}>
            <title>{monthLabel(row.month)}: {money(row.total)}</title>
            <rect x={x} y={195 - height} width={slot * 0.65} height={height} rx="3" className="income-bar" />
            <text x={x + slot * 0.325} y="218" textAnchor="middle" className="chart-label">{monthLabel(row.month, true)}</text>
          </g>;
        })}
      </svg>
    </>
  );
}
