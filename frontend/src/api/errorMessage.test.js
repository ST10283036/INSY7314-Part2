import { describe, it, expect } from "vitest";
import { getErrorMessage } from "./errorMessage";

describe("getErrorMessage", () => {
  it("prefers the first field-level validation message when present", () => {
    const err = {
      response: {
        data: {
          message: "Validation failed.",
          errors: [
            { field: "description", message: "description must contain 10 to 1000 characters." },
            { field: "price", message: "Price must be a number from 1 to 1000000." },
          ],
        },
      },
    };
    expect(getErrorMessage(err, "fallback")).toBe(
      "description must contain 10 to 1000 characters."
    );
  });

  it("falls back to the top-level message when there is no errors array", () => {
    const err = {
      response: {
        data: { message: "You already have an active booking for this gig." },
      },
    };
    expect(getErrorMessage(err, "fallback")).toBe(
      "You already have an active booking for this gig."
    );
  });

  it("falls back to the top-level message when errors is an empty array", () => {
    const err = { response: { data: { message: "Validation failed.", errors: [] } } };
    expect(getErrorMessage(err, "fallback")).toBe("Validation failed.");
  });

  it("uses the provided fallback for a network error with no response", () => {
    const err = new Error("Network error");
    expect(getErrorMessage(err, "Could not create gig.")).toBe("Could not create gig.");
  });

  it("uses the provided fallback when the response has no message at all", () => {
    const err = { response: { data: {} } };
    expect(getErrorMessage(err, "Could not create gig.")).toBe("Could not create gig.");
  });
});
