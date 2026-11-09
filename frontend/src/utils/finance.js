const amountFormat = new Intl.NumberFormat("en-ZA", {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});

export function money(value) {
  return Number.isFinite(value) ? `R${amountFormat.format(value)}` : "Unavailable";
}

export function percent(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(2)}%` : "Unavailable";
}

export function monthLabel(month, short = false) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return "Unknown month";
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-ZA", {
    month: short ? "short" : "long", ...(short ? {} : { year: "numeric" }), timeZone: "UTC",
  });
}
