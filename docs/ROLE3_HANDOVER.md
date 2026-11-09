# Role 3 handover

Branch: `feature/role3-part3`, based on `develop` at `c5b2d01` (Role 1 PR #3).
Merge reviewed work into `develop`; do not merge directly into `main`.

## Frontend

The freelancer Income page now displays the API's tax-year income, estimated tax, effective
rate and net income. It includes a March–February chart, monthly amounts, all tax brackets,
rebate explanation and API assumptions. All-time income and recent transactions are retained.
No tax logic is duplicated in the browser.

From `frontend`, use these in the combined pipeline:

```sh
npm ci
npm run verify
```

`verify` runs ESLint (warnings fail), all frontend tests and the production build, writes
`security/evidence/part3-frontend-checks.json` and exits non-zero on failure.
The standalone `.github/workflows/frontend-checks.yml` also builds and starts the frontend
container. It does not replace Role 2's full-stack workflow.

From `backend`, after `npm ci`, frontend build and `npm run setup:local`:

```sh
npm test
npm run test:newman
npm run test:dashboard
```

The last command uses Google Chrome and a temporary MongoDB. It verifies the real booking /
income flow, desktop/mobile layout and CSP, and saves screenshots and a redacted JSON summary
in `security/evidence/part3`. It does not log out or lock shared accounts.

## Docker contract for Role 2

The frontend Docker build context must be `./frontend`. Nginx listens on HTTPS 8443 and
proxies `/api/` to `https://backend:5000` on the shared Compose network.
Add this service to the final Compose file (the backend service must be named `backend`):

```yaml
  frontend:
    build: ./frontend
    ports:
      - "127.0.0.1:8443:8443"
    volumes:
      - ./backend/certs:/etc/nginx/certs:ro
    depends_on:
      backend:
        condition: service_healthy
```

Provide a working backend health check before using `service_healthy`. Use port 5000 inside
the backend container. Set `FRONTEND_ORIGINS=https://localhost:8443` and mount the same
certificate pair into both services. The backend paths can remain `certs/localhost-key.pem`
and `certs/localhost-cert.pem` relative to its working directory. Keep keys and `.env` out of
both images and Git. The frontend verifies the backend certificate as `localhost` using the
mounted trust certificate; do not turn `proxy_ssl_verify` off.

Final smoke checks should cover `/healthz`, `/api/health`, direct `/income` navigation and
registration/login/booking through **https://localhost:8443**. The standalone frontend smoke
workflow checks static hosting only, using a dummy backend DNS entry; full API proxying still
needs the real Compose integration test.

Do not publish MongoDB to the host. Keep the backend on the internal network when possible.
Currently `trust proxy` is false, so all requests through Nginx share its IP-based rate-limit
quota. If changing this, trust only the known proxy with backend exposure restricted; do not
accept client-supplied forwarding headers indiscriminately.

## Integration issues observed

At the last branch check, `origin/feature/role2-devops` was `64f139a`, based on the old
`7c0dd45` commit. Its workflow file was empty and Compose had no frontend service.
Role 2 should integrate current `develop` before finalising its branch and preserve the
security middleware, Role 1 tax/security changes and the frontend. A plain branch-to-branch
diff against `develop` is not itself a list of changes that a merge will delete; review the
actual merge result rather than replacing directories from the older snapshot.

## What is still needed from Role 2 / group

- Combined backend/frontend pipeline, static analysis and real full-stack container execution.
- Logging for login attempts, bookings, transactions and errors; evidence from the chosen
  cloud logging platform for the highest rubric band.
- Final README details for pipeline commands, deployment and cloud logging, with evidence links.
- Part 3 demo upload and URL, then group review before merging `develop` into `main`.

The existing README had a published demo password. The current text no longer contains it,
but history still does; rotate that account in any database where it exists. Do not rewrite
shared history casually or reuse that password for recording.

No shared account credentials, tokens, environment files or private keys are included here.
