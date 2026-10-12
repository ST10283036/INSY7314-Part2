# HustleHub+ - Part 2: Secure Stack

The backend now uses MongoDB for users, gigs, bookings and transaction records. It includes
freelancer income tracking, role and ownership enforcement, hardened JWT authentication,
input sanitisation, request limits and Helmet/CSP. The React frontend remains a separate
group integration task.

See [Part 2 security implementation and evidence](security/README.md) for the permission
table, security rationale, local setup, Postman/Newman collection, automated checks and
OWASP ZAP reports. The historical Part 1 demonstration link below is not a Part 2 demo.

## Additional Part 2 endpoints

| Method | Endpoint | Permission |
| --- | --- | --- |
| GET | `/api/gigs` | Authenticated users; available listings |
| GET | `/api/gigs/mine` | Freelancer; own listings |
| GET | `/api/gigs/:id` | Available listing or its owner |
| POST | `/api/gigs` | Freelancer |
| PUT/DELETE | `/api/gigs/:id` | Freelancer owner |
| POST | `/api/bookings` | Client |
| GET | `/api/bookings/mine` | Associated client/freelancer |
| GET | `/api/bookings/:id` | Associated client/freelancer; includes transaction |
| GET | `/api/income` | Freelancer; own income |
| GET | `/api/admin/summary` | Administrator only |

The sections below retain the foundation's background and setup information.

## 1. System Overview

HustleHub+ is a secure freelance marketplace platform that allows freelancers to advertise
services and clients to browse and book those services. Beyond standard marketplace
functionality, the system records financial transactions generated through bookings and gives
freelancers visibility into income earned and estimated tax obligations.

The platform handles sensitive data — user credentials, transaction records, and income
information — so security is treated as a core requirement throughout the design, not an
add-on applied afterwards.

**Part 1** delivers the secure backend foundation: user registration, login, password hashing,
JWT-based authentication, input validation, HTTPS, and a protected route demonstrating
end-to-end token verification.

## 2. Intended Users

| Role | Description |
|---|---|
| **Client** | Browses gigs and books freelancer services |
| **Freelancer** | Creates gig listings, manages bookings, tracks income |
| **Admin** | Platform oversight (Part 2/3) |

Public registration defaults to client and permits client or freelancer. Administrator
accounts are provisioned locally through a controlled process. Part 2 role checks are
enforced by the API and do not depend on frontend buttons.

## 3. Architecture

See `ArchitectureDiagramINSY7314.drawio.png` in this repository for the full system diagram, which shows the
intended MERN architecture, the HTTPS/TLS security boundary, and which components are
implemented now versus planned for later parts.

The system follows the MERN stack:

- **M**ongoDB — stores Part 2 users, gigs, bookings and transactions
- **E**xpress — REST API framework
- **R**eact — planned for Part 2
- **N**ode.js — runtime

### Backend structure

backend/
├── server.js                       — app entrypoint, HTTPS server, env validation, error handlers
├── routes/
│   └── authRoutes.js               — defines /register, /login endpoints and wires up validation
├── controllers/
│   └── authController.js           — registration and login business logic, hashing, JWT signing
├── middleware/
│   ├── authValidation.js           — express-validator rules for username/password
│   └── authenticateToken.js        — verifies JWT on protected routes
├── certs/                          — local self-signed TLS certificate (git-ignored)
└── .env                            — local configuration and secrets (git-ignored)

Separating routes, controllers, and middleware keeps request routing, business logic, and
cross-cutting concerns (validation, auth) independently testable and easy to extend as the
system grows in Part 2.

## 4. API Endpoints

| Method | Endpoint | Description | Auth required |
|---|---|---|---|
| GET | `/api/health` | Health check | No |
| POST | `/api/auth/register` | Register a new user (`username`, `password`) | No |
| POST | `/api/auth/login` | Authenticate a user, returns a JWT | No |
| GET | `/api/protected` | Example protected route | Yes (JWT, `Authorization: Bearer <token>`) |

## 5. Security Decisions

### Password hashing
Passwords are never stored as plain text. On registration, the password is hashed using
**bcrypt with a cost factor of 12** before being stored [1], [2]. Bcrypt is deliberately slow and
includes a per-password salt, which makes brute-force and rainbow-table attacks impractical
even if the underlying data were ever exposed. On login, the submitted password is compared
against the stored hash using bcrypt's constant-time comparison — the plain-text password is
never stored or logged at any point.

### JWT-based authentication
On successful login, the server issues a JSON Web Token signed with **HS256**, using a secret
loaded from an environment variable (`JWT_SECRET`) [3]. The token payload contains only the user's
`id` and `role` — no username or other personal data — and is scoped with an `issuer`,
`audience`, and expiry (`expiresIn`) claim to limit how and where the token can be used and for
how long. Protected routes use an `authenticateToken` middleware that verifies the token's
signature, issuer, audience, and expiry before allowing the request through; any missing,
malformed, or invalid token is rejected with a generic `401 Authentication required.` response,
without revealing which part of the check failed.

The server refuses to start unless `JWT_SECRET` is a genuine random value of at least 32
characters, preventing the accidental use of a placeholder or weak secret in any environment.

### Input validation
All registration and login input is validated using **express-validator** [4] before it reaches
business logic:
- Usernames must be 3–30 characters, letters/numbers/underscores only.
- Passwords must be at least 8 characters and include a lowercase letter, an uppercase letter,
  a number, and a special character (registration only — login only checks length, so as not to
  reveal password policy details to an attacker probing the login endpoint).
- Request bodies may only contain the expected fields (`username`, `password`) — any
  unexpected field is rejected outright, reducing the attack surface for injection attempts.

Validation failures return a structured `400 Validation failed.` response with a list of the
specific field errors, so legitimate clients can correct their input without the server ever
processing untrusted data.

### Controlled error handling
Centralized error-handling middleware ensures the API never leaks internal details — no stack
traces, file paths, or configuration values are returned to the client. Oversized request
bodies and malformed JSON are caught explicitly and returned with a clear, safe message,
and any unexpected server error falls back to a generic `500 An unexpected error occurred.`
response while the real error is only logged server-side.

### HTTPS
The API only runs over HTTPS, using a locally generated self-signed TLS certificate (see
Setup Instructions below) [5]. The server checks for valid certificate files at startup and refuses
to start if they can't be loaded. HTTPS encrypts all traffic between client and server —
including credentials and tokens — so that data can't be intercepted or tampered with over the
network, even on a local/development connection.

## 6. Setup Instructions

git clone <repo-url>
cd backend
npm install

### Environment configuration
Copy the example environment file and fill in a real secret:

copy .env.example .env      # Windows
# cp .env.example .env      # macOS/Linux

Generate a random JWT secret:

node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

Paste the output into `JWT_SECRET` in `.env`.

### TLS certificate
Generate a local self-signed certificate (Git Bash, since it includes OpenSSL):

mkdir certs && cd certs
openssl req -x509 -newkey rsa:2048 -keyout localhost-key.pem -out localhost-cert.pem -days 365 -nodes -subj "/CN=localhost"
cd ..

### Run

node server.js

Server runs at: `https://localhost:5000`

> Note: since the certificate is self-signed (not issued by a trusted authority), browsers and
> tools like Postman will flag it as untrusted by default. Import the public
> `backend/certs/localhost-cert.pem` into Postman's CA Certificates setting and keep SSL
> verification enabled. Never import or share the private key.

## 7. Testing

A Postman collection (`HustleHub+ Part 1 - Auth Endpoints.postman_collection.json`) is included
in this repository, covering:

**Register**
- Success — returns `201`, hashed password never exposed in the response
- Missing fields — returns `400` with structured validation errors
- Duplicate username — returns `409`

**Login**
- Success — returns `200` with a signed JWT, saves it for use in subsequent requests
- Wrong password — returns `401`, generic message
- Nonexistent user — returns `401`, same generic message (prevents username enumeration)
- Missing fields — returns `400` with structured validation errors

**Protected Route**
- Valid token — returns `200` with the authenticated user's `id` and `role`
- No token — returns `401`
- Invalid token — returns `401`

Screenshots of every request/response pair are included in this repository as evidence.

**To run:** Import the collection into Postman, ensure `baseUrl` is set to
`https://localhost:5000`, import the local public CA certificate in Postman, start the server,
then run each request — or use the
Collection Runner to execute all of them in sequence.

## 8. Demonstration Video

https://youtu.be/oq_LOhNFD1E — shows the API running, successful registration, login with
token generation, and a protected route request succeeding with a valid token and being
rejected without one.

## 9. Current Limitations

- The React frontend and its browser/CSP checks must be integrated by the group.
- Rate counters use a single-process memory store and reset on restart. Multiple API
  instances would require a shared rate-limit store.
- Development-tool dependency advisories and bounded ZAP coverage are documented in
  the security evidence; they must not be represented as a clean exhaustive assessment.
- The TLS certificate is self-signed and intended for local development only; a
  production deployment would require a certificate from a trusted certificate authority.

## 10. References

[1] npm, Inc., "bcrypt," *npm*, 2026. [Online]. Available: https://www.npmjs.com/package/bcrypt. [Accessed: 7-Sep-2026].

[2] OWASP Foundation, "Password Storage Cheat Sheet," *OWASP Cheat Sheet Series*, 2026. [Online]. Available: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html. [Accessed: 7-Sep-2026].

[3] M. Jones, J. Bradley, and N. Sakimura, "JSON Web Token (JWT)," *RFC 7519, Internet Engineering Task Force (IETF)*, May 2015. [Online]. Available: https://datatracker.ietf.org/doc/html/rfc7519. [Accessed: 7-Sep-2026].

[4] express-validator contributors, "express-validator," 2026. [Online]. Available: https://express-validator.github.io/docs/. [Accessed: 7-Sep-2026].

[5] OWASP Foundation, "Transport Layer Security Cheat Sheet," *OWASP Cheat Sheet Series*, 2026. [Online]. Available: https://cheatsheetseries.owasp.org/cheatsheets/Transport_Layer_Security_Cheat_Sheet.html. [Accessed: 7-Sep-2026].
