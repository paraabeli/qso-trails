# Security & Privacy Hardening Checklist

This document tracks the August 2026 code/configuration audit of QSO Trails. The goal is stricter than ordinary web-app security: only data deliberately approved for public rendering should ever cross the public boundary, and failures should reduce disclosure rather than broaden it.

Status values:

- **DONE** — implemented in the current hardening branch.
- **PARTIAL** — meaningful mitigation is implemented, but follow-up remains.
- **TODO** — not yet implemented.
- **OPS** — requires repository/host/operator configuration outside application code.

## Blocking / high priority

### 1. LoTW-confirmed-only publishing could fail open — DONE

Risk: if LoTW snapshot transformation failed while the administrator selected `confirmed`, the original all-QSO snapshot could be written.

Implemented:

- `privacy-guard.js` is loaded before the existing publishing layers.
- Every final atomic `public-snapshot.json` write passes through the privacy guard.
- If stored settings require `lotwFilter=confirmed`, the guard requires a LoTW-aware v4+ snapshot proving the filter was applied.
- Unsafe/malformed writes throw before the temp file is written, so the previous known-good snapshot remains intact and the atomic rename never occurs.

Follow-up: add dedicated integration coverage for upstream LoTW transformer failures.

### 2. Count selection was presentation-only — DONE for public JSON

Risk: `allQsoCount`, `lotwCount`, and `qsoCount` were all available publicly even when the operator selected only one count.

Implemented:

- `allQsoCount` and `returnedQsos` are stripped from public JSON.
- When stats are disabled, aggregate count fields are removed.
- QSO-only mode publishes only the QSO count.
- LoTW-only mode publishes only one generic public count whose value is the LoTW-confirmed count; the embed labels it as LoTW.
- Both mode publishes QSO count plus LoTW count.
- Full metrics remain available only in authenticated Admin state.

Note: visitors can still count the QSO records actually delivered to their browser. This is inherent when those paths are public; the guard prevents disclosure of additional totals beyond the delivered records/selected public aggregate.

### 3. Standalone Dockerfile was weaker than Compose — DONE

Risk: the old Dockerfile used Node 20, `npm install`, broad `COPY . .`, root execution, and did not force production-mode fail-fast checks.

Implemented:

- Node `24.19.0-alpine3.24`.
- `NODE_ENV=production`.
- lockfile-only `npm ci --omit=dev --ignore-scripts`.
- explicit source-file copies only.
- non-root `USER node`.
- privacy guard included in the image.

### 4. Local development could bind publicly — DONE

Risk: a development/POC `3000:3000` mapping can bind on all host interfaces.

Implemented:

- `compose.dev.yaml` maps `127.0.0.1:3000:3000` only.
- development and production use separate named data volumes.
- documentation explicitly says not to change the binding to `0.0.0.0` on an untrusted network.

### 5. Local environment files could be committed/baked into images — DONE

Risk: `.env.local`, `.env.production`, `.env.development`, etc. were not all covered by ignore rules.

Implemented:

- `.gitignore` ignores `.env` and `.env.*`, except tracked example templates.
- `.dockerignore` uses the same rule.
- tracked `.env.production.example` and `.env.development.example` contain placeholders only.

### 6. Production Admin was Internet-reachable by default — DONE for canonical production Compose

Implemented:

- `compose.prod.yaml` sets `REQUIRE_ADMIN_ALLOWLIST=true`.
- `privacy-guard.js` refuses to start in production when that policy is enabled but `ADMIN_ALLOWED_IPS` is empty.
- `.env.production.example` makes the allowlist required.
- legacy `compose.yaml` also enables the requirement.

Operator requirement: choose addresses that remain correct for the actual reverse-proxy topology.

## Medium priority

### 7. Public privacy changes could remain in shared HTTP caches — DONE

Implemented:

- final `/api/public` responses are forced to `Cache-Control: no-store`.
- final `/static/qrz.png` responses are forced to `Cache-Control: no-store`.

Operational note: responses cached by an older deployment may remain in third-party caches until their pre-existing TTL expires. Deploying the new headers cannot retroactively erase already cached copies.

### 8. Generic `/assets` mount exposed HTML documents — DONE

Implemented:

- the privacy guard inserts a middleware before `/assets` static serving and returns 404 for `.html` / `.htm` requests.
- JavaScript/CSS assets remain same-origin and public as intended.

Longer-term cleanup: split browser assets and HTML templates into separate filesystem directories so this does not rely on a routing guard.

### 9. Static renderer had no rate limiter — DONE

Implemented:

- `/static/qrz.png` receives a 60 requests/minute/IP in-process limiter before rendering.
- stale limiter buckets are cleaned up to bound memory use.

Follow-up: if deployed behind a CDN/reverse proxy chain, verify trusted client-IP handling before relying on this as an abuse-control boundary.

### 10. `trust proxy = 1` assumes one trusted reverse proxy — TODO

Risk: direct exposure of application port 3000 or adding extra untrusted proxy hops could let forwarded-address handling undermine IP allowlisting/rate limiting.

Planned:

- document supported proxy topology explicitly.
- consider a configurable trusted-proxy CIDR/function rather than a fixed hop count.
- add tests proving spoofed `X-Forwarded-For` does not bypass the production Admin allowlist in the supported Caddy topology.

Mitigation already present: production Compose does not publish application port 3000.

### 11. Wavelog SSRF DNS rebinding / connection pinning — TODO

Current protections already include HTTPS-by-default, private/reserved address rejection, URL credential/query/fragment rejection, and redirects disabled.

Remaining work:

- pin the actual outbound connection to an address that passed validation, or use a custom dispatcher/lookup that validates every resolved address at connect time.
- normalize IPv4-mapped IPv6 and additional special-use ranges explicitly.
- test DNS rebinding and multi-A/AAAA answers.

### 12. LoTW confirmation pagination needs a total record cap — TODO

Current code caps pages but could theoretically process millions of confirmation records from a malicious/broken upstream.

Planned:

- add a total confirmation-record cap comparable to the QSO safety cap.
- fail while retaining the previous confirmation cache if the cap is exceeded.

### 13. Aggregate DXCC should be privacy-opt-in by default — PARTIAL

The privacy guard only retains DXCC aggregates when stored settings explicitly enable `showDxccStats`.

Remaining work:

- change the core server/default UI default from enabled to disabled for brand-new installations.
- add migration documentation so existing operators keep their current explicit preference.

### 14. Station label/public home location privacy semantics — TODO

Presentation flags such as `name=0` hide text but do not constitute data-access controls. A public QSO map inherently needs a public start/home position to draw paths, but station labels should have a separate server-side publish permission.

Planned:

- add `publishStationName` server-side privacy toggle, default off.
- only include `settings.stationName` in `/api/public` when enabled.
- clarify that a public path map necessarily reveals the configured rounded public home position.

### 15. DOM construction from QSO-derived values — TODO / low risk

Some option lists use `innerHTML` with normalized band values. Current input normalization and CSP make exploitation unlikely, but safer DOM APIs are preferable.

Planned: replace data-derived option construction with `new Option()` / `textContent` throughout Admin and embed code.

## Supply chain / repository

### 16. Main branch has no required status checks — OPS

The GitHub repository currently has no branch protection on `main`.

Recommended repository policy:

- require pull requests before merging.
- require the `security / node-security` check.
- prevent force pushes and branch deletion.
- optionally require signed commits / linear history according to project preference.

This is a GitHub repository administration setting, not an application-code setting.

### 17. Privacy regression tests — IN PROGRESS

Current CI already checks syntax, production dependency audit, Compose validity, image build/start, `/embed`, `/api/public`, and static PNG rendering.

Planned additions in this hardening branch:

- validate both `compose.prod.yaml` and `compose.dev.yaml`.
- assert production Compose does not publish port 3000.
- assert development Compose binds only to `127.0.0.1`.
- add fixture-based public-snapshot tests containing sentinel private values (source ID, exact/private fields, LoTW timestamp, callsign/date/grid when disabled) and ensure those sentinels cannot survive the final privacy guard.
- assert a v3/all-QSO snapshot is rejected when settings demand LoTW-confirmed-only publishing.

## Deployment files

Canonical files after this hardening work:

- `compose.prod.yaml` + `.env.production` — Internet-facing production through Caddy.
- `compose.dev.yaml` + `.env.development` — loopback-only local development/testing.
- `compose.yaml` + `.env` — retained as a hardened compatibility production path for existing installs.

Never reuse development credentials in production, and never commit the actual environment files.
