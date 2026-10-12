# Security findings and verification

## Corrected implementation issues

| Finding | Change | Verification |
| --- | --- | --- |
| Invalid JWT catch referenced an undefined variable | Generic 401 rejection; no raw token/error logging | Altered, expired, wrong issuer/audience/algorithm and subject tests |
| Roles trusted an older JWT claim | Retrieve the current MongoDB user and stored role | Stale admin claim denied; disabled/deleted users denied |
| Availability validator used a misspelled field | Strict boolean validation on the actual `isAvailable` field | Strings and objects rejected; owner can change a boolean |
| Missing headers and quotas | Helmet/CSP, CORS allowlist, general and sensitive-route limits | Header assertions; 429 and Retry-After assertions |
| Gig text could carry HTML rather than ordinary text | Strip HTML before length checks and storage | Stored text checked after scripting payloads |
| Income aggregation matched `completed ` instead of `completed` | Correct the status filter | Recorded booking contributes to the correct freelancer only |
| Incomplete files on main prevented booking integration | Use Role 1's completed `feature/role1-gigs` baseline | Real booking, transaction and income regression tests |

## ZAP assessment

The default-policy run covered anonymous, client, freelancer and administrator contexts.
The focused follow-up covered client and freelancer JSON API requests with the available
SQL injection and reflected scripting rules. The HTML reports and JSON summaries record
actual requests, successful authenticated seed responses and scanner results.

The measured runs reported informational findings only; no low, medium or high alerts
were reported. This is a result for the recorded scope and budgets, not a guarantee that
the whole system is vulnerability-free.

| Informational alert | Assessment |
| --- | --- |
| Authentication Request Identified | Expected identification of the login endpoint; not a reported vulnerability. |
| Re-examine Cache-control Directives | API responses intentionally set `Cache-Control: no-store`. The advice is retained for review rather than suppressed. |

Each active phase was limited to two minutes with a one-minute per-rule cap, one thread
and a three-second delay. Some rules may not finish their full parameter set. Rate limiting
was not disabled. The protected seed responses demonstrate valid authentication, but they
do not establish that every later scanner request stayed authenticated. Business-rule and
NoSQL operator checks are covered separately by the regression suites.

## Dependency assessment

The recorded npm audit reported zero production advisories and 19 advisories including
development tools. These are principally the Newman/Postman toolchain and are recorded
in `evidence/dependency-audit.json`. Do not describe the complete dependency tree as clean.
Use only trusted collections, disposable local data and a development environment; monitor
upstream fixes. A forced downgrade was not used to conceal or bypass the findings.

## Remaining group checks

- The React frontend is not present in this repository yet. Apply and test CSP on the actual
  HTML, verify frontend-to-API requests and include the frontend in security testing.
- Verify any lecturer-specific ZAP evidence requirements against the slides.
- Confirm the proposed read-only administrator summary and marketplace gig visibility
  policy if the lecturer requires different administrative capabilities.
- Capture live screenshots from the local demo; screenshots are not replaced by this text.
