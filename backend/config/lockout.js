"use strict";

// Per-account brute-force protection for the login endpoint.
// After MAX_FAILED_LOGINS wrong passwords the account is locked for LOCKOUT_MS,
// regardless of which IP address the guesses came from.
module.exports = Object.freeze({
    MAX_FAILED_LOGINS: 5,
    LOCKOUT_MS: 15 * 60 * 1000,
});
