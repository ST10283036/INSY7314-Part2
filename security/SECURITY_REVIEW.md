# HustleHub+ Security Review (Part 3)

This review covers the four areas the brief asks for: injection, cross-site scripting (XSS), authentication weaknesses and access control. For each, it lists the threat, the control in this codebase, the file that implements it and the test that proves it. Two features were added in Part 3 to close gaps found during this review: **account lockout** and **token revocation on logout**.

Evidence: 46 backend tests (`npm test` in `backend`), 44 Newman requests with 65 assertions (`npm run test:newman`), and 47 frontend tests. Results are saved in `security/evidence/`.

## 1. Injection

| Threat | Control | Where |
| --- | --- | --- |
| NoSQL operator injection (for example `{"username": {"$ne": ""}}` in a login body) | Every field is validated as a plain string by express-validator before it reaches a query. Objects and arrays are rejected with a generic 400 that does not echo the input. | `backend/middleware/authValidation.js`, `gigValidation.js`, `bookingValidation.js` |
| Mass assignment (a client sending `role: "admin"` or `price` on a booking) | `allowOnlyFields` rejects any body field that is not on the route's allow-list. Roles on registration are limited to client and freelancer; booking amounts always come from the stored gig. | `backend/middleware/requestValidation.js` |
| Malformed IDs and query manipulation | Route IDs are checked as valid ObjectIds (400 otherwise). Query strings that are not expected are rejected. | validators above |
| Oversized or malformed payloads | JSON body limit of 10 KB, strict JSON parsing, and `Content-Type: application/json` required on writes. | `backend/app.js` |
| Schema bypass | Mongoose schemas enforce types, ranges and required fields as a second layer. | `backend/models/*.js` |

Tests: "credentials reject MongoDB operator objects without echoing input", "registration denies admin roles and unknown owner fields", "gig validators reject unknown fields, object inputs, invalid money and availability types", "invalid IDs, query manipulation, malformed JSON and incorrect media types fail safely", "booking ownership and amounts come from stored records". Newman: "Query-shaped login denied", "Booking rejects client-supplied amount".

## 2. Cross-site scripting (XSS)

| Threat | Control | Where |
| --- | --- | --- |
| Stored XSS through gig titles and descriptions | `sanitize-html` strips all tags and attributes from free-text fields before storage. | `plainText` in `backend/middleware/requestValidation.js` |
| Reflected or DOM XSS in the UI | React escapes rendered values by default, and the frontend does not use `dangerouslySetInnerHTML` or `innerHTML`. | `frontend/src` |
| Injected script running if something slips through | A strict Content-Security-Policy: `script-src 'self'`, `script-src-attr 'none'`, `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'`, with no `unsafe-inline`, `unsafe-eval` or wildcards. | `backend/middleware/securityHeaders.js` |
| Clickjacking and MIME sniffing | `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`. | Helmet |

Tests: "gig input strips scripting/HTML before storage", "Helmet sets restrictive headers without wildcard or unsafe script permissions". Newman: "Freelancer creates sanitised gig" (HTML removed), "01 Health and security headers".

Residual risk: the JWT is kept in `localStorage`, so a successful XSS could read it. The CSP and input sanitising reduce that risk, and the server-side revocation added in Part 3 limits how long a copied token stays useful. Moving the token to an HttpOnly cookie would remove the exposure, but needs CSRF protection and was left out of scope.

## 3. Authentication weaknesses

| Threat | Control | Where |
| --- | --- | --- |
| Stolen password database | Passwords are stored as bcrypt hashes (cost 12), excluded from queries by default (`select: false`), and never returned. | `backend/models/User.js`, `authController.js` |
| Weak passwords | Password rules are enforced on registration. | `backend/middleware/authValidation.js` |
| Username enumeration | Unknown user and wrong password return the same 401 message; duplicate registration returns a controlled response. | `authController.js` |
| Forged or tampered tokens | JWTs are HS256 only, with issuer, audience, subject and expiry checked. Tokens with unexpected claim shapes are rejected, and the role is re-read from the database, so a stale or altered role claim has no effect. | `backend/middleware/authenticateToken.js` |
| Disabled accounts reusing tokens | The user is looked up on every request and must still be active. | `authenticateToken.js` |
| Brute-force guessing | Per-IP rate limits (10 logins, 10 registrations per window), plus **account lockout (new)**: 5 wrong passwords lock the account for 15 minutes with a 429 and `Retry-After`. The counter is updated atomically, so concurrent guesses cannot bypass it, and a successful login resets it. | `backend/middleware/rateLimiters.js`, `backend/config/lockout.js`, `authController.js` |
| Stolen or copied token stays valid | **Token revocation (new)**: each user has a `tokenVersion`. Tokens carry it as `tv`, and `POST /api/auth/logout` increments it, so every token issued earlier (including on other devices) is rejected immediately. | `User.js`, `authController.js`, `authenticateToken.js` |
| Traffic interception | The API only serves HTTPS, with HSTS enabled. | `backend/server.js`, Helmet |

Tests: "duplicate usernames and incorrect login receive controlled responses", "passwords are bcrypt hashes and are excluded from normal user queries", "JWT rejects altered, expired, wrong issuer/audience/algorithm and mismatched subject tokens", "database roles override outdated JWT role claims", "disabled and deleted users cannot reuse previously valid tokens", the three lockout tests, the three revocation tests, and the login and registration rate-limit tests. Newman: "Incorrect login is generic", "Altered token denied", the logout and revoked-token requests, "Login throttling".

Note on lockout: a lockout can be used to deny a legitimate user access by deliberately failing logins against their username. This is a trade-off. The lock is short (15 minutes), it applies to one account only, and the per-IP limiter still applies across accounts.

## 4. Access control

| Threat | Control | Where |
| --- | --- | --- |
| A client performing freelancer actions, or the reverse | `requireRole` on every route. Gig writes are freelancer-only, booking creation is client-only, income is freelancer-only, and the admin summary is admin-only. | `backend/middleware/requireRole.js`, `backend/routes/*.js` |
| Reading or changing another user's records (IDOR) | Queries are scoped to the signed-in user (for example `{ _id, freelancer: req.user.id }`), so other users' records return 404 rather than 403, which also avoids confirming they exist. | `gigController.js`, `bookingController.js`, `incomeController.js` |
| Income and tax data leaking between freelancers | The income and tax endpoint only aggregates the caller's own completed transactions. | `incomeController.js` |
| Privilege escalation | Admin cannot be self-registered, a role in the token body or request is ignored, and the database role is the source of truth. | `authController.js`, `authenticateToken.js` |
| Booking abuse | One active booking per client per gig, per-user booking rate limit, and cancellation only by the participants. | `bookingController.js`, `rateLimiters.js` |

Tests: "freelancers cannot book and clients cannot read freelancer income", "clients and admins cannot perform freelancer-only gig mutations", "cross-owner gig updates and deletion are denied and leave the record unchanged", "only associated users can view a booking and its transaction", "booking lists and freelancer income stay scoped to their own records", "administrator oversight is explicitly separated from ordinary-user capabilities", "a client cannot hold two active bookings for the same gig", "cancelling a booking is limited to its participants and removes its transaction".

## 5. Known limitations

- The tax figure is an estimate for planning, based on the published SARS brackets and primary rebate. It ignores deductions, other rebates and provisional tax rules. The assumptions are returned by the API and shown to the user.
- The JWT is stored in `localStorage` (see section 2).
- The per-IP rate-limit counters are held in memory per server instance, so they reset on restart and would need a shared store (for example Redis) if the API ran on several instances. Account lockout and token revocation are stored in the database, so they survive restarts and work across instances.
