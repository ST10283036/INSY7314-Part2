# HustleHub+ — Part 2: Core Marketplace Features & Security Hardening

## Group Members

| Name | Student Number |
|---|---|
| Ayakha Ntsomi | ST10283036 |
| Imran Awaldien | ST10458418 |
| Ashleigh Kruger | ST10440651 |

## Table of Contents

- [Group Members](#group-members)
- [2. System Overview](#2-system-overview)
- [3. Intended Users](#3-intended-users)
- [4. Architecture](#4-architecture)
- [5. API Endpoints](#5-api-endpoints)
- [6. Security Decisions](#6-security-decisions)
- [7. Setup Instructions](#7-setup-instructions)
- [8. Testing](#8-testing)
- [9. Security Testing](#9-security-testing)
- [10. Demonstration Video](#10-demonstration-video)
- [11. Known Limitations (Part 2)](#11-known-limitations-part-2)
- [12. AI Declaration](#12-ai-declaration)
- [13. References](#13-references)

## 2. System Overview

HustleHub+ is a secure freelance marketplace platform that allows freelancers to advertise
services and clients to browse and book those services. The system records financial
transactions generated through bookings and gives freelancers visibility into income earned.

The platform handles sensitive data — user credentials, transaction records, and income
information — so security is treated as a core requirement throughout the design, not an
add-on applied afterwards.

**Part 1** delivered the secure backend foundation: registration, login, password hashing,
JWT-based authentication, input validation, HTTPS, and a protected route demonstrating
end-to-end token verification.

**Part 2** builds on that foundation with:
- Persistent storage via **MongoDB/Mongoose**, replacing Part 1's in-memory array
- A full **React frontend** covering every role: registration with role selection, login, gig
  browsing and management, booking and booking cancellation, income tracking, and an admin
  summary view
- **Gig** creation, browsing, updating, and deletion, enforced by **role-based access control**
  (freelancer-only write access)
- **Booking** creation, viewing, and cancellation (with duplicate-active-booking prevention),
  **income** reporting for freelancers, and an **admin** summary endpoint, all gated by
  role-based access, rate limiting, request sanitisation, and security headers (Helmet/CSP)
- An expanded automated test suite (Postman/Newman for the API, Vitest + React Testing
  Library for the frontend) and a documented, role-scoped security-testing pass (npm audit,
  OWASP ZAP, Nmap)

## 3. Intended Users

| Role | Description |
|---|---|
| **Client** | Browses gigs, books and cancels bookings |
| **Freelancer** | Creates gig listings, views bookings received, tracks income |
| **Admin** | Platform oversight — aggregate counts of users, gigs, bookings, and transactions |

Users select their role (`client` or `freelancer`) at registration; `admin` cannot be
self-registered (public registration explicitly rejects it) and is provisioned separately (see
Section 6). Every protected route that performs a write or exposes role-specific data is
enforced server-side by a `requireRole(...)` middleware — the role claimed in the JWT is
checked on every request, not just trusted from the client.

## 4. Architecture

See `ArchitectureDiagramINSY7314.drawio.png` in this repository for the full system diagram.

The system follows the MERN stack:

- **M**ongoDB — persistent storage via Mongoose, replacing Part 1's in-memory array
- **E**xpress — REST API framework
- **R**eact — the Part 2 frontend, built with Vite
- **N**ode.js — runtime

### Backend structure

```
backend/
├── app.js                          — Express app: security headers, CORS, rate limiting,
│                                      route mounting, error handling
├── server.js                       — entrypoint: env validation, HTTPS server startup
├── routes/
│   ├── authRoutes.js                — /register, /login
│   ├── gigRoutes.js                 — gig CRUD, browsing
│   ├── bookingRoutes.js             — booking creation, retrieval, and cancellation
│   ├── incomeRoutes.js              — freelancer income summary
│   └── adminRoutes.js               — admin aggregate summary
├── controllers/                     — business logic per resource
├── middleware/
│   ├── authValidation.js            — express-validator rules for auth
│   ├── authenticateToken.js         — verifies JWT on protected routes
│   ├── requireRole.js               — role-based access control (403 on mismatch)
│   ├── gigValidation.js             — validation rules for gig endpoints
│   ├── bookingValidation.js         — validation rules for booking endpoints
│   ├── securityHeaders.js           — Helmet configuration (CSP, HSTS, frame options, etc.)
│   ├── rateLimiters.js              — per-endpoint rate limiting
│   ├── requestValidation.js         — shared validation-error handling
│   └── errorHandler.js              — centralised error handling
├── models/                          — Mongoose schemas (User, Gig, Booking, Transaction)
├── config/db.js                     — MongoDB connection
├── scripts/                         — local setup, demo data, and security-testing scripts
│   └── create-local-admin.js        — provisions an admin account in the dev database
├── certs/                           — local self-signed TLS certificate (git-ignored)
└── .env                             — local configuration and secrets (git-ignored)

frontend/
├── src/
│   ├── api/client.js                — shared Axios instance, Bearer-token interceptor
│   ├── context/AuthContext.jsx      — auth state, localStorage persistence
│   ├── components/                  — Navbar, ProtectedRoute
│   └── pages/                       — Login, Register, Gigs, MyGigs, Bookings, Income,
│                                       AdminSummary (each with a matching test file)
```

Separating routes, controllers, and middleware keeps request routing, business logic, and
cross-cutting concerns (validation, auth, rate limiting) independently testable.

## 5. API Endpoints

| Method | Endpoint | Description | Auth required |
|---|---|---|---|
| GET | `/api/health` | Health check | No |
| POST | `/api/auth/register` | Register a new user (`username`, `password`, `role`) | No |
| POST | `/api/auth/login` | Authenticate a user, returns a JWT | No |
| GET | `/api/protected` | Example protected route | Yes |
| GET | `/api/gigs` | Browse all available gigs | Yes |
| GET | `/api/gigs/mine` | List the authenticated freelancer's own gigs | Yes (freelancer) |
| GET | `/api/gigs/:id` | Get a single gig by ID | Yes |
| POST | `/api/gigs` | Create a new gig | Yes (freelancer) |
| PUT | `/api/gigs/:id` | Update an owned gig | Yes (freelancer, owner) |
| DELETE | `/api/gigs/:id` | Delete an owned gig | Yes (freelancer, owner) |
| POST | `/api/bookings` | Book a gig (rejects a second active booking of the same gig) | Yes (client) |
| GET | `/api/bookings/mine` | List the authenticated user's bookings | Yes (client, freelancer) |
| GET | `/api/bookings/:id` | Get a single booking by ID, with its transaction | Yes (client, freelancer, owner) |
| PATCH | `/api/bookings/:id/cancel` | Cancel a confirmed booking; removes its transaction | Yes (client, freelancer, owner) |
| GET | `/api/income` | Get the authenticated freelancer's income summary | Yes (freelancer) |
| GET | `/api/admin/summary` | Aggregate counts of users, gigs, bookings, transactions | Yes (admin) |

## 6. Security Decisions

### Password hashing
Passwords are hashed using **bcrypt with a cost factor of 12** before being stored [1], [2].
On login, the submitted password is compared against the stored hash using bcrypt's
constant-time comparison — the plain-text password is never stored or logged.

### JWT-based authentication
The server issues a JSON Web Token signed with **HS256**, scoped with `issuer`, `audience`,
and expiry claims [3]. `authenticateToken` middleware verifies all of these on every protected
request — plus the token's structural shape and that the user is still active in the database —
and rejects any missing, malformed, or invalid token with a generic `401` response.

### Role-based access control
Every route that writes data or exposes role-specific information is gated by a
`requireRole(...allowedRoles)` middleware that checks the `role` claim embedded in the verified
JWT against the roles permitted for that route, returning `403` on a mismatch [6]. This is
enforced server-side on every request — a client cannot bypass it by hiding a UI element,
since the same check runs regardless of what the frontend displays. Ownership is also checked
inside the database query itself (not just the role) for gigs and bookings, so one freelancer
cannot edit another's gig, and one client cannot view another client's booking — both return
`404`, not `403`, so the response never reveals whether the resource exists at all. RBAC
enforcement across gigs, bookings, income, and admin was explicitly tested and confirmed via
the Postman/Newman suites described in Section 7.

### Input validation and sanitisation
All registration, login, gig, and booking input is validated using **express-validator** [4]
before it reaches business logic, with request bodies restricted to expected fields, a `10kb`
body-size cap enforced globally, and `Content-Type: application/json` required on every
write request.

### CORS
Cross-origin requests are restricted to an explicit allow-list (`FRONTEND_ORIGINS`, defaulting
to the local frontend's origin) [12]. Requests from any other origin are rejected with a
custom `CORS_ORIGIN_DENIED` error before reaching application logic, and credentials are not
shared cross-origin.

### Rate limiting
Login (10 requests / 15 minutes), registration (10 requests / 60 minutes), booking creation
and cancellation (20 requests / 15 minutes combined, keyed by user ID), and the API as a whole
(300 requests / 15 minutes) are all independently rate-limited using `express-rate-limit` [9],
mitigating brute-force and credential-stuffing attempts against the most sensitive endpoints.

### Security headers
**Helmet** [7] sets a strict Content-Security-Policy (`default-src 'self'`, no inline scripts,
no framing, no plugin objects), `Strict-Transport-Security`, `X-Frame-Options: DENY`,
`Referrer-Policy: no-referrer` on every response [8]. All `/api` responses are also explicitly
marked `Cache-Control: no-store`, preventing sensitive API responses from being cached by the
browser.

### Controlled error handling
Centralised error-handling middleware ensures the API never leaks internal details — no stack
traces, file paths, or configuration values are returned to the client.

### HTTPS
The API only runs over HTTPS, using a locally generated self-signed TLS certificate [5]. An
Nmap TLS/cipher scan (Section 8) confirmed every supported cipher suite rates "A" strength,
with no weak or legacy ciphers offered.

## 7. Setup Instructions

```bash
git clone <repo-url>
cd backend
npm install
```

### Environment configuration
Copy the example environment file and fill in real values:
```bash
copy .env.example .env      # Windows
# cp .env.example .env      # macOS/Linux
```
Generate a random JWT secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Set `MONGO_URI` to a local MongoDB instance (e.g. `mongodb://127.0.0.1:27017/hustlehub`) and
`FRONTEND_ORIGINS` to the frontend's origin (default `http://localhost:5173`).

### MongoDB
Install MongoDB Community Server and ensure the service is running locally before starting
the backend.

### TLS certificate
```bash
npm run setup:local
```
Generates `certs/localhost-key.pem` and `certs/localhost-cert.pem` with the correct Subject
Alternative Names (`localhost` and `127.0.0.1`). The script preserves an existing certificate
pair rather than overwriting it, so delete both files first if you need to regenerate one (for
example, if browser or Newman requests start failing with a certificate hostname-mismatch
error).

> The first time your browser visits `https://localhost:5000`, it will flag the self-signed
> certificate as untrusted — accept the warning once. If the certificate is ever regenerated,
> the browser will need to be told to trust it again, since a new certificate is a new piece
> of trust data even for the same domain.

### Run the backend
```bash
node server.js
```
Server runs at: `https://localhost:5000`

### Run the frontend
```bash
cd frontend
npm install
npm run dev
```
Frontend runs at: `http://localhost:5173`

### Admin account
Public registration only allows `client` or `freelancer`. To create an admin account in your
local development database (the same one your regular dev server uses):
```bash
cd backend
npm run admin:create
```
This prints a freshly generated username and password for a new admin account — log in with
those at `/login` to see the **Admin Summary** screen. For reference, during development this
produced:
```
username: demo_admin
password: Jk1sHwojivqRaA1!
```
(Re-run `npm run admin:create` to generate a fresh account/password at any time — it is safe
to run repeatedly and simply updates the existing `demo_admin` account if one already exists.)

> Note: since the TLS certificate is self-signed, browsers and tools like Postman will flag it
> as untrusted by default. Disable SSL certificate verification in Postman's settings, or
> accept the browser's security warning, for local testing.

## 8. Testing

### Backend: Postman + Newman
Two Postman collections cover the API end to end:

- `HustleHub_Part2_Gigs.postman_collection.json` — the full Gigs CRUD lifecycle, including
  explicit RBAC-enforcement negative tests (a client attempting freelancer-only actions
  correctly receives `403`), ownership checks, not-found, and no-token cases — 16 requests,
  26 assertions, all passing.
- `HustleHub_Part2_BookingIncome.postman_collection.json` — booking creation, listing, and
  detail retrieval; duplicate-active-booking rejection; cross-user access denial; and income
  reporting with its own RBAC checks — 23 requests, 38 assertions, all passing.

**To run via Postman UI:** Import a collection, ensure `baseUrl` is `https://localhost:5000`,
disable SSL certificate verification, start the server, then use the Collection Runner to
execute the folders in order (tokens and IDs are chained across requests).

**To run via Newman (CLI):**
```bash
npm install -g newman
newman run "HustleHub_Part2_Gigs.postman_collection.json" --insecure
newman run "HustleHub_Part2_BookingIncome.postman_collection.json" --insecure
```
Output: `screenshots/newman-cli-run-output.txt` for the Gigs run.

A third, security-focused Postman suite (`security/Part2-Security.postman_collection.json`)
covers authentication, RBAC, booking integrity (server-trusted pricing, not client-supplied),
income isolation between freelancers, and login throttling, across all roles. It runs against
an isolated, disposable in-memory database so it never touches your real data:
```bash
npm run test:newman
```
Output: `security/evidence/newman-summary.json` (39 requests, 57 assertions, all passing).

### Frontend: Vitest + React Testing Library
Automated tests cover every page — Login, Register, Gigs (including booking and the
duplicate-booking error path), MyGigs, Bookings (including cancellation and its confirmation
dialog), Income, and AdminSummary: rendering, user interaction, success paths, error paths,
and loading/empty states — 32 tests, all passing.

**To run:**
```bash
cd frontend
npm test
```
Output: `screenshots/vitest-run-output.txt`.

Screenshots of every Postman request/response pair from Part 1, and the full result sets
described above for Part 2, are included in this repository as evidence.

## 9. Security Testing

Beyond functional testing, the backend was assessed using a standard security-testing
methodology: dependency scanning, dynamic vulnerability scanning, and network/TLS scanning.
This evidence directly supports the security decisions in Section 5, rather than standing as a
separate deliverable.

### Dependency scanning (npm audit)
`npm audit` reports **zero vulnerabilities in production dependencies**. Including development
tooling (specifically `newman`, the Postman CLI runner, and its transitive dependencies — never
shipped or run in production) raises that to 19 findings (7 moderate, 11 high, 1 critical), all
confined to that one dev-only dependency tree. Full detail:
`security/evidence/dependency-audit.json`.

### Dynamic vulnerability scanning (OWASP ZAP)
An OWASP ZAP [10] baseline automated scan was run against the live backend. Results: **0 High,
0 Medium, 2 Low, 1 Informational** — no serious vulnerabilities. The two Low findings (missing
`Strict-Transport-Security` and `X-Content-Type-Options` headers) and the Informational finding
(cache-control directives) are all directly resolved by the Helmet configuration and explicit
`Cache-Control: no-store` described in Section 5. Full report:
`screenshots/zap-baseline-scan-report.html`.

A second, more extensive set of role-scoped ZAP scans was also run from four perspectives —
anonymous, client, freelancer, and admin — plus a focused follow-up scan targeting the booking
and gig write endpoints specifically for injection. Every phase came back with **Informational
findings only, zero High/Medium/Low**, across all four roles. Full reports and raw results:
`security/evidence/zap-anonymous.html`, `zap-client.html`, `zap-client-focused.html`,
`zap-freelancer.html`, `zap-freelancer-focused.html`, `zap-admin.html` (and matching `.json`
files), plus a browser-based frontend scan at `zap-frontend.html`.

### Network and TLS scanning (Nmap)
Nmap [11] was used for two scans against the backend host:
1. A full TCP port scan (`-p-`) confirming only the expected application port is exposed to
   the local network, with other open ports attributable to unrelated local development
   tools and services, not the HustleHub+ application.
2. A service/TLS scan (`-sV -sC --script ssl-cert,ssl-enum-ciphers`) against port 5000,
   confirming the self-signed certificate matches what is documented in Section 5, and that
   **every supported TLS 1.2 and TLS 1.3 cipher suite rates "A" strength**, with no weak or
   legacy ciphers offered.

Full output: `screenshots/nmap-full-port-scan.txt` and `screenshots/nmap-tls-service-scan.txt`.

## 10. Demonstration Video

https://youtu.be/r842C0fItIs

## 11. Known Limitations (Part 2)

- The TLS certificate is self-signed and intended for local development only; a production
  deployment would require a certificate from a trusted certificate authority.
- A production deployment should restrict network exposure (firewall rules) to only the
  ports actually required, rather than relying on a development machine's default state.
- The admin role currently exposes a read-only platform summary only. The `User` model already
  supports an `isActive` flag (and `authenticateToken` already honours it), but there is no
  admin-facing endpoint yet to actually deactivate or reactivate a user — a natural next step
  if user-management functionality is required.
- Cancelling a booking deletes its associated transaction record outright (rather than marking
  it as refunded), since the `Transaction` model currently only supports a `completed` status.
  This keeps freelancer income figures accurate without further schema changes, but means
  cancelled bookings have no corresponding transaction history.
- `npm audit` findings are confined to `newman`, a development-only dependency used purely for
  running the Postman test suites; it is never installed or run in production.

## 12. AI Declaration

Generative AI (Claude, Anthropic) was used during the development of this project to assist
with:
- Structuring backend code (routes, controllers, middleware) and frontend components following
  consistent, idiomatic patterns.
- Diagnosing and explaining error messages and unexpected behaviour (e.g. validation failures,
  TLS certificate issues, HTTP status codes), and helping implement the corresponding fixes.
- Drafting and reviewing automated tests (Vitest/React Testing Library and Postman/Newman
  collections) alongside the application code they exercise.
- Reviewing, updating, and formatting project documentation, including this README.

All AI-assisted output was reviewed, tested, and verified by the group before being committed.
Architectural decisions, security requirements, and final implementation choices remain the
responsibility of the group members listed above.

## 13. References

[1] npm, Inc., "bcrypt," *npm*, 2026. [Online]. Available: https://www.npmjs.com/package/bcrypt. [Accessed: 12-Oct-2026].

[2] OWASP Foundation, "Password Storage Cheat Sheet," *OWASP Cheat Sheet Series*, 2026. [Online]. Available: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html. [Accessed: 12-Oct-2026].

[3] M. Jones, J. Bradley, and N. Sakimura, "JSON Web Token (JWT)," *RFC 7519, Internet Engineering Task Force (IETF)*, May 2015. [Online]. Available: https://datatracker.ietf.org/doc/html/rfc7519. [Accessed: 12-Oct-2026].

[4] express-validator contributors, "express-validator," 2026. [Online]. Available: https://express-validator.github.io/docs/. [Accessed: 12-Oct-2026].

[5] OWASP Foundation, "Transport Layer Security Cheat Sheet," *OWASP Cheat Sheet Series*, 2026. [Online]. Available: https://cheatsheetseries.owasp.org/cheatsheets/Transport_Layer_Security_Cheat_Sheet.html. [Accessed: 12-Oct-2026].

[6] OWASP Foundation, "Authorization Cheat Sheet," *OWASP Cheat Sheet Series*, 2026. [Online]. Available: https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html. [Accessed: 12-Oct-2026].

[7] Helmet contributors, "Helmet.js," 2026. [Online]. Available: https://helmetjs.github.io/. [Accessed: 12-Oct-2026].

[8] OWASP Foundation, "Content Security Policy Cheat Sheet," *OWASP Cheat Sheet Series*, 2026. [Online]. Available: https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html. [Accessed: 12-Oct-2026].

[9] npm, Inc., "express-rate-limit," *npm*, 2026. [Online]. Available: https://www.npmjs.com/package/express-rate-limit. [Accessed: 12-Oct-2026].

[10] OWASP Foundation, "OWASP ZAP," 2026. [Online]. Available: https://www.zaproxy.org/. [Accessed: 12-Oct-2026].

[11] Nmap Project, "Nmap: the Network Mapper," 2026. [Online]. Available: https://nmap.org/. [Accessed: 12-Oct-2026].

[12] npm, Inc., "cors," *npm*, 2026. [Online]. Available: https://www.npmjs.com/package/cors. [Accessed: 12-Oct-2026].
