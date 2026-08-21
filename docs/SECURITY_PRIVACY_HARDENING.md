# Security & Privacy Hardening Checklist

This document tracks the August 2026 code/configuration audit of QSO Trails. The goal is stricter than ordinary web-app security: only data deliberately approved for public rendering should ever cross the public boundary, and failures should reduce disclosure rather than broaden it.

Status values:

- **DONE** — implemented and covered by the current hardening code/tests.
- **PARTIAL** — meaningful mitigation is implemented, but follow-up remains.
- **TODO** — not yet implemented.
- **OPS** — requires repository/host/operator configuration outside application code.

## Blocking / high priority

### 1. LoTW-confirmed-only publishing could fail open — DONE

`privacy-guard.js` validates every final atomic public snapshot write. If stored settings require `lotwFilter=confirmed`, a LoTW-aware v4+ snapshot is required; unsafe writes fail before rename so the previous known-good snapshot remains.

### 2. Count selection was presentation-only — DONE for public JSON

Internal `allQsoCount` / `returnedQsos` accounting is stripped from public JSON. Public aggregate counts now follow the selected QSO / LoTW / both mode, while full metrics remain authenticated Admin data.

### 3. Standalone Dockerfile was weaker than Compose — DONE

The production image uses Node 24.19, production mode, lockfile-only `npm ci --ignore-scripts`, explicit copies and non-root execution. Privacy, network, and privacy-default guards are included in the image.

### 4. Local development could bind publicly — DONE

`compose.dev.yaml` binds only `127.0.0.1:3000:3000` and uses a separate development volume.

### 5. Local environment files could be committed/baked into images — DONE

Git and Docker ignore runtime `.env` / `.env.*` files while allowing tracked example templates.

### 6. Production Admin was Internet-reachable by default — DONE for canonical production Compose

Production requires an Admin IP/CIDR allowlist and does not publish application port 3000.

## Medium priority

### 7. Public privacy changes could remain in shared HTTP caches — DONE

`/api/public` and `/static/qrz.png` are forced to `Cache-Control: no-store` at the final outbound guard.

### 8. Generic `/assets` mount exposed HTML documents — DONE

HTML documents are rejected from the generic asset path before static serving.

### 9. Static renderer had no rate limiter — DONE

`/static/qrz.png` has an in-process per-IP limiter. Client-IP correctness depends on the explicit trusted-proxy policy rather than a fixed hop count.

### 10. `trust proxy = 1` assumes one trusted reverse proxy — DONE for supported Compose topologies

`network-guard.js` replaces the core fixed hop-count value with explicit policy. Production uses `TRUST_PROXY=loopback,uniquelocal`; development uses `TRUST_PROXY=false`.

### 11. Wavelog SSRF DNS rebinding / connection pinning — DONE for application Wavelog API requests

Wavelog API requests validate all A/AAAA answers immediately before connection, normalize mapped IPv6, reject restricted results by default, pin the socket to a validated address, preserve hostname verification, reject redirects, and cap buffered response size.

See `docs/NETWORK_BOUNDARY_HARDENING.md`.

### 12. LoTW confirmation pagination needs a total record cap — DONE

Default confirmation safety ceiling is 500,000 records, with the previous successful confirmation cache retained if a refresh exceeds the limit.

### 13. Aggregate DXCC should be privacy-opt-in by default — DONE

`showDxccStats` is now interpreted as enabled only when explicitly stored as `true`.

- brand-new installs therefore start with aggregate DXCC publication disabled;
- existing installs with explicit `true` keep it enabled;
- the final public snapshot independently clears `stats.dxcc` unless the stored permission is true.

### 14. Station label/public home location privacy semantics — DONE

Added `publishStationName`, default off.

- Admin has a dedicated **Publish station / callsign label publicly** permission.
- `settings.stationName` is omitted from the public snapshot unless that permission is true.
- presentation-only `name=0` remains distinct from the server privacy permission.
- the rounded public home position remains governed separately because a public path map requires a public start position.

See `docs/PRIVACY_DEFAULTS_UI_SAFETY.md`.

### 15. DOM construction from QSO-derived values — DONE with compatibility guard

`public/dom-safety.js` runs before Admin/embed application code and narrows `HTMLSelectElement.innerHTML` to inert option-only construction. Dynamic option strings therefore cannot become arbitrary executable markup.

New code should use `new Option()`, `textContent`, and `replaceChildren()` directly; the compatibility guard protects remaining legacy assignments.

## Supply chain / repository

### 16. Main branch has no required status checks — OPS

Recommended repository policy:

- require pull requests before merging;
- require `security / node-security`;
- prevent force pushes and branch deletion;
- optionally require signed commits / linear history according to project preference.

### 17. Privacy regression tests — DONE

CI covers:

- syntax checks and production dependency audit;
- production/development Compose validity and port-binding assertions;
- production image build/start and public/static smoke tests;
- private sentinel fields through the final public snapshot guard;
- fail-open LoTW snapshot rejection;
- public cache/asset privacy behavior;
- trusted-proxy replacement behavior;
- private/reserved/mapped-IP classification;
- LoTW confirmation-cap boundaries;
- privacy-default persistence;
- station-name omission by default;
- DXCC aggregate omission by default.

## Remaining application-code audit items

No unresolved application-code items remain from the August 2026 checklist. Repository branch protection remains an operator/repository-administration task.

## Deployment files

Canonical files:

- `compose.prod.yaml` + `.env.production` — Internet-facing production through Caddy.
- `compose.dev.yaml` + `.env.development` — loopback-only local development/testing.
- `compose.yaml` + `.env` — hardened compatibility production path for existing installs.

Never reuse development credentials in production, never commit actual environment files, and review trusted-proxy settings whenever the reverse-proxy topology changes.
