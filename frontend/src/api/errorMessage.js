// Picks the most specific error message out of an axios error response.
//
// The backend's validation middleware (see backend/middleware/requestValidation.js)
// returns a generic top-level `message` ("Validation failed.") plus a structured
// `errors` array with the actual per-field reason, e.g.:
//   { message: "Validation failed.", errors: [{ field: "description", message: "description must contain 10 to 1000 characters." }] }
//
// Other error responses (auth failures, duplicate bookings, etc.) only ever send
// `message`, with no `errors` array. This helper prefers the first field-level
// message when present, falls back to the top-level message, and finally to a
// caller-supplied default for network errors or anything unexpected.
export function getErrorMessage(err, fallback) {
  const data = err?.response?.data;
  const firstFieldMessage = data?.errors?.[0]?.message;
  return firstFieldMessage || data?.message || fallback;
}
