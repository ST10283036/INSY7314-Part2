# Part 2 security implementation

## Rubric mapping

| Criterion | Marks | Implementation and evidence |
| --- | ---: | --- |
| RBAC enforcement | 15 | Database-backed roles; freelancer-only gig changes; owner-scoped updates/deletion; participant-scoped booking and transaction reads; own-income aggregation; admin-only summary. |
| JWT, validation and sanitisation | 15 | HS256 signature, issuer, audience, subject, expiry and ID checks; current-user lookup; blocked role escalation; field allowlists; plain-text HTML sanitisation; controlled errors. |
| Rate limiting | 10 | Login 10/15 minutes/IP; registration 10/hour/IP; booking 20/15 minutes/user; general API 300/15 minutes/IP. HTTP 429, meaningful messages and retry headers. |
| Helmet and CSP | 10 | Restrictive resource policy, framing protection, MIME-sniffing protection, HSTS and referrer policy. The actual React HTML must receive the policy when the frontend is integrated. |

## Permissions

| Operation | Client | Freelancer | Admin |
| --- | --- | --- | --- |
| Browse available gigs | Yes | Yes | Yes |
| Create/update/delete gigs | No | Own records only | No automatic bypass |
| Create booking | Yes | No | No |
| View booking and transaction | Associated client only | Associated freelancer only | No automatic bypass |
| View income | No | Own income only | No |
| Read platform summary | No | No | Yes |

Available gig listings are marketplace information. Unavailable listings and financial records are private. Unauthorised private-resource requests receive 404 so their existence is not disclosed. Confirm with the lecturer whether a different interpretation of gig visibility or additional administrative capabilities is expected.

The proposed administrator capability is read-only counts at `GET /api/admin/summary`. It exposes no credentials and does not override resource ownership. Public registration accepts only client or freelancer. Administrator creation is a controlled local operation, not a public API feature.

## Request flow and decisions

1. Helmet and CORS run before routes, so security headers are present on errors too.
2. The general API limiter runs before JSON parsing. Authentication routes also have stricter limits.
3. JWT verification checks the signature, HS256 algorithm, issuer, audience, subject and expiry. User IDs must be valid MongoDB identifiers.
4. The current user is loaded from MongoDB. Deleted or disabled accounts are rejected, and the current stored role is used instead of an outdated token claim.
5. Role checks run in the API, independently of frontend controls. Ownership checks use stored owner/participant IDs. Gig update and delete queries include the authenticated freelancer ID in the database filter.
6. Validation rejects unknown fields, invalid types, invalid IDs, invalid prices and empty updates. HTML is stripped from title and description before checking their final length. Passwords are never trimmed or HTML-sanitised.
7. Booking owner and amount values come from authenticated identity and the stored gig, never from user-supplied client, freelancer or amount fields.
8. Password hashes use bcrypt cost 12 and are excluded from normal user queries. Responses do not expose password hashes, stack traces, database errors or configuration values.

Prices are JSON numbers from 1 to 1000000 with at most two decimal places. Availability must be a JSON boolean. Current endpoints do not support query parameters; unsupported filters are rejected rather than used as database query objects.

CORS permits the configured frontend origins and requests from tools that have no browser Origin header. CORS is a browser sharing policy, not a replacement for authentication. Trust proxy remains disabled for direct local HTTPS so forwarded IP headers cannot be used as client identity.

## Setup and repeatable checks

Run from `backend`:

```powershell
npm.cmd install
npm.cmd run setup:local
npm.cmd test
npm.cmd run test:newman
npm.cmd run security:audit
```

`npm.cmd run start:local` starts a real local MongoDB process on port 27018 and the HTTPS API on port 5000. The local database persists in `%LOCALAPPDATA%/HustleHub-Part2/mongo`, outside the OneDrive project. A random signing secret is held in process memory; restarting invalidates earlier tokens. For the group's configured database, use the ignored `.env` and `npm.cmd start` instead.

Do not copy passwords, tokens, `.env`, private keys or raw scan sessions into Git. `setup:local` creates an ignored localhost certificate without overwriting an existing complete pair. Import its public certificate into Postman's CA certificate settings; do not import the private key.

`npm.cmd run demo:prepare` is for the local development server only. It creates fictional users and sample records, and writes a private Postman environment in `.private-evidence`. It provisions an administrator only in the dedicated local demonstration database. Do not run this against a shared or production database.

The security collection is `Part2-Security.postman_collection.json`. Newman uses a separate, disposable real MongoDB and verified HTTPS, so its assertions do not depend on shared data. The Node suite also uses a separate real database and tests modified/expired tokens, role changes, disabled users, cross-owner records, invalid input, rate limits and failed-transaction rollback.

## OWASP ZAP

Install the verified local tools once:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\setup-zap.ps1
npm.cmd run test:zap
npm.cmd run test:zap:focused
```

The ZAP runner starts a disposable HTTPS API and MongoDB, binds ZAP to loopback, and uses Protected mode with a context restricted to that API port. It seeds anonymous, client, freelancer and administrator requests. Authenticated seed responses must succeed before that role's active scan starts. The per-role Authorization rule is scoped to the local API and removed between roles.

Passive scanning is restricted to the context. Each active scan has a two-minute budget, one thread and a three-second request delay. API rate limits remain enabled. Reports describe these bounds; a completed scanner status does not establish exhaustive rule or endpoint coverage. ZAP does not prove business-rule authorisation, so the cross-user regression tests remain necessary.

The additional focused run selects SQL injection, reflected scripting and any available NoSQL/MongoDB rules for client and freelancer API requests. Its summary records the rules actually available. This supplements the default-policy run, which can spend its limited time on filesystem-related probes before reaching JSON input rules.

Reports in `evidence` are actual ZAP HTML and JSON with credentials and JWTs redacted. Raw reports, session data, tool downloads and logs remain ignored. Review alerts, check reproduction, fix confirmed issues, then repeat the affected tests and scans. Do not remove an alert merely to obtain an empty report.

An informational authentication-identification alert describes a login endpoint rather than a vulnerability. The cache-control advisory should be reviewed against the actual response: API responses deliberately use `no-store` to avoid retaining private data. Keep the assessment with the submitted findings.

## Evidence and remaining integration

See [Security findings and verification](FINDINGS.md) for the corrected issues,
assessment of ZAP alerts, dependency risks and remaining group checks.

- `evidence/node-test-results.json`: measured automated security results.
- `evidence/newman-summary.json`: measured request and assertion counts, excluding credentials.
- `evidence/dependency-audit.json`: separate production and development-tool advisories.
- `evidence/zap-*.html` and `evidence/zap-*.json`: anonymous and authenticated scan results and scope.

For live screenshots, start the local API, run `npm.cmd run demo:prepare`, import
`Part2-Demo.postman_collection.json` and the ignored private demo environment, then run
the demo collection. The separate full security collection is for the isolated Newman
runner; do not run its registration setup against already prepared demo accounts.

Newman brings upstream development-tool advisories. Review the audit file; do not claim a clean audit for the entire toolchain merely because production dependencies have no advisories. Run only the group's trusted collections in isolated local test environments. Forced dependency downgrades were not applied.

The repository currently has no React frontend. Role 3 must integrate its build, verify the normal user flow under CSP and scan the frontend as well. `FRONTEND_DIST_PATH` can point to the completed build so Express applies Helmet/CSP to the HTML. A CSP on a separately served JSON API does not protect the frontend document. Prefer CSS classes and bundled assets rather than inline scripts/styles or broad CSP exemptions.

These checks support the highest rubric bands, but lecturer-specific ZAP slides and evidence requirements must be checked before final submission. This document does not claim a complete whole-group Part 2 submission.

## References

- [Helmet](https://helmet.js.org/)
- [express-rate-limit configuration](https://express-rate-limit.mintlify.app/reference/configuration)
- [Express CORS](https://expressjs.com/en/resources/middleware/cors/)
- [ZAP modes](https://www.zaproxy.org/docs/desktop/start/features/modes/)
- [ZAP authentication](https://www.zaproxy.org/docs/desktop/start/features/authentication/)
- [ZAP API and active-scan settings](https://www.zaproxy.org/docs/api/)
