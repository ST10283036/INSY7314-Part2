# HustleHub+ — Part 3: DevSecOps, Monitoring and Finalisation

HustleHub+ lets freelancers list services and clients book them. Each booking records a
transaction, and freelancers can see their earnings and an estimated income-tax amount.

## Group members

| Name | Student number |
| --- | --- |
| Ayakha Ntsomi | ST10283036 |
| Imran Awaldien | ST10458418 |
| Ashleigh Kruger | ST10440651 |

## Contents

- [Part 3 delivery status](#part-3-delivery-status)
- [Features and architecture](#features-and-architecture)
- [Run locally](#run-locally)
- [Income and tax calculation](#income-and-tax-calculation)
- [API endpoints](#api-endpoints)
- [Security review](#security-review)
- [Tests and static analysis](#tests-and-static-analysis)
- [Docker and pipeline](#docker-and-pipeline)
- [Logging and monitoring](#logging-and-monitoring)
- [Demonstration and submission](#demonstration-and-submission)
- [Limitations](#limitations)
- [References](#references)

## Part 3 delivery status

This branch contains Role 3's work on top of Role 1's merged `develop` changes.
It must be reviewed and integrated into `develop` before the group promotes the final version to `main`.

| Rubric area | Implementation / evidence | Integration status |
| --- | --- | --- |
| Tax and income dashboard (20) | Server calculation, summary cards, monthly chart, bracket table, assumptions; [screenshots](security/evidence/part3/) | Implemented and tested |
| CI/CD (20) | [Frontend checks](.github/workflows/frontend-checks.yml) install, lint, test, build and run the frontend container | Role 2 must integrate backend/security checks and the full stack |
| Static analysis (10) | ESLint, zero-warning gate, [result summary](security/evidence/part3-frontend-checks.json) | Frontend complete; backend analysis is Role 2's handover |
| Docker (10) | [Frontend Dockerfile](frontend/Dockerfile), HTTPS Nginx, verified upstream TLS | Full Compose stack and both-container CI evidence pending Role 2 integration |
| Logging (10) | Required events and evidence described below | Awaiting Role 2 implementation and cloud logging evidence |
| Additional security (15) | Account lockout and token revocation; backend and Newman tests | Implemented by Role 1 |
| Security review (10) | Threat/control mapping below and [detailed review](security/SECURITY_REVIEW.md) | Included |
| README (5) | Setup, features, security, testing and handover | Final pipeline/logging details and Part 3 video link must be added |

The role split is a working agreement; the marks above are assessed for the combined project.
The final submission is not complete until the pending integration and evidence items are resolved.

## Features and architecture

- **Clients:** register, log in, browse available gigs, book a service, view their bookings and
  transaction details, and cancel their own bookings.
- **Freelancers:** create, hide/show and delete their own gigs; view received bookings;
  inspect all-time income, current tax-year income, estimated tax and income after estimated tax.
- **Admins:** view aggregate platform counts. Public registration cannot create an admin.
- **Part 3 security:** five incorrect passwords temporarily lock an account; logout revokes
  every earlier token belonging to that account.

The React application calls the Express API. Middleware validates input, verifies the JWT,
loads the current database role and checks permission before controllers query MongoDB.
Booking prices and ownership are taken from stored records rather than the client request.
A successful booking creates a transaction, which is included in that freelancer's income.

In the local production preview, Express serves the built React files over HTTPS.
The frontend container uses Nginx to serve those files and forward `/api/` requests to the
HTTPS backend. This keeps browser requests on one origin and works with the strict CSP.

Key locations:

- `backend/routes/`, `controllers/`, `models/`: API routing, business logic and database schemas.
- `backend/middleware/`: JWT, roles, validation, rate limits, security headers and safe errors.
- `backend/utils/tax.js`: tax-year boundaries, brackets, rebate and monthly totals.
- `frontend/src/pages/Income.jsx`: financial dashboard; calculations come from the API.
- `frontend/src/components/MonthlyIncomeChart.jsx`: dependency-free SVG monthly chart.
- `frontend/src/context/AuthProvider.jsx`: authentication state and logout request.
- [Original architecture diagram](ArchitectureDiagramINSY7314.drawio.png): Part 1/2 foundation.

## Run locally

Use Node.js 24, npm, Git and Chrome. No global Newman installation is needed.
Docker Desktop is needed only for the container workflow.

From the repository root, run each command on its own line:

```powershell
cd frontend
npm.cmd ci
npm.cmd run verify
cd ../backend
npm.cmd ci
npm.cmd run setup:local
npm.cmd run start:local
```

Open **https://localhost:5000**. The local certificate is self-signed; trust that specific
localhost certificate for development. Do not disable certificate checking globally.
Keep the server terminal open. Stop it with Ctrl+C before starting another copy.

`start:local` starts a local MongoDB on port 27018 and an HTTPS server on port 5000.
It stores the local database outside the repository and generates a new in-memory JWT secret
on restart, so old login tokens stop working. It automatically serves `frontend/dist`
when that build exists. It is a development helper, not the container entrypoint.

For live frontend editing, keep the backend running, open another terminal in `frontend`
and run `npm.cmd run dev`. Visit **http://localhost:5173**. The production build uses
same-origin `/api`; the dev build calls **https://localhost:5000/api**.

### Configured database / deployment

For `npm start` in `backend`, copy `backend/.env.example` to `backend/.env` and set:

| Variable | Purpose |
| --- | --- |
| `MONGO_URI` | MongoDB connection |
| `JWT_SECRET` | Strong randomly generated signing secret, kept outside Git |
| `JWT_EXPIRES_IN` | Token lifetime, for example `1h` |
| `JWT_ISSUER`, `JWT_AUDIENCE` | Expected token issuer and audience |
| `FRONTEND_ORIGINS` | Exact permitted frontend origin(s), comma-separated |
| `TLS_KEY_PATH`, `TLS_CERT_PATH` | Private key and certificate paths |
| `FRONTEND_DIST_PATH` | Optional built React directory, relative to backend |
| `PORT` | HTTPS port; defaults to 5000 |

Generate local certificates with `npm.cmd run setup:local`. Existing pairs are preserved.
Never commit environment files, private keys, account passwords or exported Postman tokens.

For an admin, configure `MONGO_URI` to the intended development database, then run
`npm.cmd run admin:create` from `backend`. This script uses that configured database, not
the temporary recording database. Keep the generated credentials private. Do not reset a shared demo account
while another member is using it. Previously published demo credentials must be rotated.

## Income and tax calculation

`GET /api/income` is restricted to freelancers. It aggregates only the signed-in
freelancer's completed transactions. The all-time total is kept separate from the tax-year
total; past-year earnings do not increase the current-year estimate.

The South African tax year runs from **1 March to the end of February**, using SAST (UTC+2).
The API returns twelve monthly buckets, March first, including months with no transactions.
The current table is the **SARS 2027 tax year**, 1 March 2026 to 28 February 2027 [14].

Calculation:

1. Add completed income within the tax-year boundaries.
2. Tax each portion of that income at its progressive bracket rate.
3. Subtract the primary rebate, capped at the tax before rebate.
4. Clamp estimated tax at zero. Round money to two decimals.
5. Net income = tax-year income minus estimated tax.
6. Effective tax rate = estimated tax / tax-year income, or zero if income is zero.

Worked example from the dashboard integration test:

| Step | Amount |
| --- | ---: |
| Tax-year income | R300,000.00 |
| First R245,100 at 18% | R44,118.00 |
| Remaining R54,900 at 26% | R14,274.00 |
| Tax before rebate | R58,392.00 |
| Primary rebate applied | R17,820.00 |
| Estimated tax | R40,572.00 |
| Income after estimated tax | R259,428.00 |
| Effective tax rate | 13.52% |

The frontend displays the returned figures without duplicating tax calculations.
Users can expand the monthly amounts and all seven tax brackets. The chart is accompanied
by a readable table, and all API assumptions appear below the calculation.

This is an estimate on income earned so far, not a full-year forecast or payment calculation.
It assumes an individual under 65 and excludes other income, deductions, medical/retirement
credits, provisional tax and VAT. Income after tax is not an available payout balance.
For an unconfigured tax year the backend falls back to its latest table; the table needs
maintenance as SARS publishes new rates.

## API endpoints

| Method | Endpoint | Description | Auth required |
|---|---|---|---|
| GET | `/api/health` | Health check | No |
| POST | `/api/auth/register` | Register a new user (`username`, `password`, `role`) | No |
| POST | `/api/auth/login` | Authenticate a user, returns a JWT | No |
| POST | `/api/auth/logout` | Revoke all tokens issued to the signed-in user | Yes |
| GET | `/api/protected` | Example protected route | Yes |
| GET | `/api/gigs` | Browse all available gigs | Yes |
| GET | `/api/gigs/mine` | List the authenticated freelancer's own gigs | Yes (freelancer) |
| GET | `/api/gigs/:id` | Get an available gig; hidden gigs require their owner | Yes |
| POST | `/api/gigs` | Create a new gig | Yes (freelancer) |
| PUT | `/api/gigs/:id` | Update an owned gig | Yes (freelancer, owner) |
| DELETE | `/api/gigs/:id` | Delete an owned gig | Yes (freelancer, owner) |
| POST | `/api/bookings` | Book a gig (rejects a second active booking of the same gig) | Yes (client) |
| GET | `/api/bookings/mine` | List the authenticated user's bookings | Yes (client, freelancer) |
| GET | `/api/bookings/:id` | Get a single booking by ID, with its transaction | Yes (client, freelancer, owner) |
| PATCH | `/api/bookings/:id/cancel` | Cancel a confirmed booking; removes its transaction | Yes (client, freelancer, owner) |
| GET | `/api/income` | Own income, current tax-year estimate, monthly totals and tax breakdown | Yes (freelancer) |
| GET | `/api/admin/summary` | Aggregate counts of users, gigs, bookings, transactions | Yes (admin) |

## Security review

The [detailed security review](security/SECURITY_REVIEW.md) contains file locations and
named tests for each control. The main threat/control mapping is:

| Threat | Implemented protection | Evidence |
| --- | --- | --- |
| NoSQL/operator injection | Plain-string validation, ObjectId checks, strict field allow-lists, typed schemas and 10 KB JSON limit | Backend and Newman negative-input tests |
| Stored/reflected XSS | Strip HTML from gig text; React escapes displayed values; no raw HTML rendering; strict same-origin CSP | Sanitisation tests, browser CSP checks, dashboard assumption-text test |
| Password guessing | bcrypt cost 12, generic invalid-login response, IP rate limits and per-account lockout | Lockout expiry/reset tests and rate-limit tests |
| Forged/stale tokens | HS256 verification, issuer/audience/expiry/subject checks, active user and current role loaded from MongoDB | JWT and database-role tests |
| Copied token after logout | Database token version incremented on authenticated logout; older versions rejected | Revocation tests, Newman and real-browser logout check |
| Role escalation / IDOR | Public admin registration denied; server roles and owner-scoped queries; private income aggregation | Cross-role and cross-owner tests |
| Transport interception / clickjacking | HTTPS, HSTS, restrictive CSP, DENY framing and MIME-sniffing protection | Header tests and historical TLS scans |
| Sensitive data in errors | Controlled response messages, no raw stack traces or query input returned | Malformed input and safe-error tests |

**Additional feature 1 — account lockout:** five wrong passwords lock that account for
15 minutes. Login returns 429 with `Retry-After`; a successful login resets the failure
counter. State is stored in MongoDB, so a process restart does not clear it.

**Additional feature 2 — token revocation:** tokens include a user token-version claim.
`POST /api/auth/logout` increments the database version, invalidating that user's existing
tokens across devices. The UI calls the endpoint before clearing its local session.
If that network request fails, local logout still occurs, but server revocation is not
guaranteed until a successful request; the token otherwise remains subject to expiry.

Residual risks: JWTs remain in localStorage and could be stolen by a successful XSS.
Account lockout can be abused to temporarily deny a known user's access. IP rate counters
are per-process, so a multi-instance deployment needs a shared store. These limits are
documented rather than treated as solved by the new features.

## Tests and static analysis

From `frontend`:

```powershell
npm.cmd run verify
```

This runs ESLint, all Vitest tests and the Vite production build. It returns a non-zero exit
code if any step fails and saves a summary with no local paths or credentials to
[part3-frontend-checks.json](security/evidence/part3-frontend-checks.json).

Frontend lint fixes:

- Split the authentication provider from its hook/context so Fast Refresh has component-only exports.
- Preserve the original exception as `cause` while showing only controlled error messages.
- Load initial bookings and gigs through asynchronous callbacks with unmount guards.
- Treat warnings as failures; do not disable the rules to make the pipeline pass.

The dashboard tests cover tax-year versus all-time amounts, percentages, all twelve months,
zero income, expandable brackets, assumptions, refresh/retry and safe text rendering.
The browser check exercises the real API, including a booking-generated transaction and
a non-zero tax estimate. Desktop/mobile screenshots are stored with its report.

From `backend`, after the frontend build and certificate setup:

```powershell
npm.cmd test
npm.cmd run test:newman
npm.cmd run test:dashboard
```

The backend and Newman suites create temporary databases with their own secrets. They do not
require a database service or touch shared accounts. The first run may download MongoDB.
The dashboard browser check also uses an isolated database and needs Google Chrome.

Evidence:

- [Backend test result](security/evidence/node-test-results.json).
- [Newman result](security/evidence/newman-summary.json).
- [Frontend lint, tests and build](security/evidence/part3-frontend-checks.json).
- [Real-browser dashboard result](security/evidence/part3/dashboard-browser-results.json).
- [Desktop dashboard](security/evidence/part3/income-dashboard-desktop.png).
- [Mobile dashboard](security/evidence/part3/income-dashboard-mobile.png).

ESLint is static code analysis, not a replacement for dependency or dynamic security scans.
The Part 2 ZAP, Nmap and audit reports remain under `security/evidence/` and `screenshots/`;
their timestamps identify them as historical evidence, not fresh Part 3 scans.
Before submission, run the agreed security checks on the final integrated version and review
any findings. Do not describe an old clean scan as proof that every later change is secure.

## Docker and pipeline

The [frontend Dockerfile](frontend/Dockerfile) uses a Node 24 build stage and a separate
Nginx runtime. Lint, tests and build are required during image construction. Source code,
development dependencies, environment files and private keys are not copied into the runtime.
Nginx serves HTTPS on **8443**, supports direct navigation to React routes and forwards
`/api/` to **https://backend:5000**.

TLS files are mounted read-only at `/etc/nginx/certs`. The upstream certificate is verified
against the mounted certificate with hostname `localhost`; verification is not disabled.
Nginx applies CSP and other security headers to the HTML as well as retaining API headers.

[Role 3 handover](docs/ROLE3_HANDOVER.md) includes the exact Compose service block for Role 2.
The backend and frontend must share a Docker network, the backend service must be named
`backend`, and both services must use the agreed certificate pair.

The [Frontend checks workflow](.github/workflows/frontend-checks.yml) runs on pushes to
`main`, `develop` and this feature branch, and on pull requests into `main` or `develop`.
It installs locked dependencies, runs verification, builds the image and starts the frontend
container to check HTTPS, a React deep link and CSP. Reports are uploaded as workflow artifacts.
A failed check fails the job; cleanup/log collection does not mask the check result.

That smoke test covers the frontend container only. Role 2 must add the backend/security
checks and a full Compose smoke test with both application containers running to satisfy the
combined-stack requirement. Replace this integration note with the final workflow/run links
once that work is merged and verified.

## Logging and monitoring

Role 2 owns the logger and cloud integration. The Role 1 base currently contains controlled
console error messages, not the completed Part 3 monitoring system. Do not submit this section
as evidence that cloud logging already works.

The final logger should record login success/failure, account lockout, logout/revocation,
rejected tokens, booking creation/cancellation, transaction creation and unexpected errors.
For each event, include a timestamp, event name, outcome and a correlation identifier as
appropriate. This helps detect repeated login failures and investigate missing or failed
booking/transaction operations.

Exclude passwords, JWTs, Authorization headers, connection strings, private keys and raw
request bodies. Limit identifiers to what is necessary for investigation.
The final handover must name the logging platform, explain access/retention, link redacted
example events and demonstrate their arrival in that platform. Cloud logging evidence is
needed for the rubric's highest logging band; console output alone is insufficient.

## Demonstration and submission

**Part 3 video: recording/upload pending.** Add the final accessible video link here before submission.
The [Part 2 video](https://youtu.be/r842C0fItIs) is retained as previous evidence and is not
the final Part 3 demonstration.

For a recording without touching shared accounts, build the frontend, then run
`npm.cmd run record:part3` from `backend`. Open **https://localhost:5443**.
This creates two accounts in a separate temporary database and saves their credentials to
the ignored `.private-evidence/part3-recording-accounts.txt`. Keep the terminal open;
restarting clears only this recording database and changes its password. Do not display
the credentials file in the video. This helper runs the actual app locally, not Docker;
container and cloud logging evidence must come from the final integrated stack.

The final recording must show authentication, gig creation, booking and transaction recording,
then the income/tax dashboard. Include concise evidence of tests/static analysis, the completed
pipeline, running containers, logging and the two additional security features.
Use dedicated recording accounts; never deliberately lock or revoke shared group accounts.

Before the final push:

- Integrate reviewed role branches into `develop` in the agreed order.
- Rerun checks on the combined code, not only each member's separate branch.
- Confirm backend/frontend containers run together in CI and locally as documented.
- Add cloud logging evidence and final pipeline/static-analysis results.
- Upload the Part 3 video; check its link from a browser where the owner is not signed in.
- Replace pending README items with actual results and evidence links.
- Review the final diff for secrets, then merge reviewed `develop` into `main`.

## Limitations

- Local TLS is self-signed; deployed environments need a trusted certificate.
- Booking transactions represent application records, not a real payment gateway.
- Cancellation deletes the associated transaction, so cancelled bookings no longer contribute
  to income and have no retained transaction history.
- The tax assumptions and table-maintenance requirement are explained above.
- Admin oversight is read-only; there is no account-management screen.
- Development-tool dependency findings must be reviewed separately from production packages.
- The frontend proxy makes requests from one container address. With the backend's current
  `trust proxy = false`, IP-based limits are shared behind it. Role 2 should either document
  this conservative behaviour or trust only the known proxy after restricting backend exposure;
  blindly trusting arbitrary forwarding headers would weaken rate limiting.

## References

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

[14] South African Revenue Service, "Rates of Tax for Individuals", 2027 tax year and primary
rebate. https://www.sars.gov.za/tax-rates/income-tax/rates-of-tax-for-individuals/
Accessed 9 November 2026.

[15] Docker, "Multi-stage builds". https://docs.docker.com/build/building/multi-stage/
Accessed 9 November 2026.

[16] NGINX, "ngx_http_proxy_module", upstream TLS verification.
https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_ssl_verify
Accessed 9 November 2026.
