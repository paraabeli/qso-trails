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

The production image uses Node 24.19, production mode, lockfile-only `npm ci --ignore-scripts`, explicit copies and non-root execution. Both privacy and network guards are included in the image.

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

`/static/qrz.png` has an in-process per-IP limiter. Client-IP correctness now depends on the explicit trusted-proxy policy documented below rather than a fixed hop count.

### 10. `trust proxy = 1` assumes one trusted reverse proxy — DONE for supported Compose topologies

Implemented in `network-guard.js`:

- intercept the core server's fixed `trust proxy = 1` assignment.
- production sets `TRUST_PROXY=loopback,uniquelocal`, matching Caddy on the private Docker network.
- development sets `TRUST_PROXY=false` because the application is reached directly on loopback.
- a direct public peer is not trusted merely because it supplies `X-Forwarded-For`.
- tests verify that the old hop-count value is replaced by the selected policy.

Operator note: Cloudflare, Kubernetes ingress, another load balancer, or a changed network topology requires explicit review of `TRUST_PROXY`. Never use blanket trust without understanding every possible path to the application.

### 11. Wavelog SSRF DNS rebinding / connection pinning — DONE for application Wavelog API requests

`network-guard.js` now performs a second DNS policy check at the actual fetch boundary and pins the socket to an address from that validated result.

Implemented:

- validate all A/AAAA answers immediately before connection.
- reject the request when any result is restricted while private Wavelog access is disabled.
- normalize IPv4-mapped IPv6 before policy checks.
- use a custom Node HTTP(S) lookup callback returning the validated IP, preventing a second DNS lookup at socket connect time.
- retain the original hostname for Host/TLS SNI and certificate verification.
- reject redirects.
- cap individual Wavelog responses before buffering.

See `docs/NETWORK_BOUNDARY_HARDENING.md`.

### 12. LoTW confirmation pagination needs a total record cap — DONE

Canonical cap:

```text
WAVELOG_CONFIRMATION_MAX_RECORDS=500000
```

At the normal 1,000 records/page, pages 1–500 are allowed and page 501 is rejected. The LoTW feature retains its previous successful confirmation cache when a refresh fails.

A separate response-size safety limit is also set:

```text
WAVELOG_MAX_RESPONSE_BYTES=16777216
```

### 13. Aggregate DXCC should be privacy-opt-in by default — PARTIAL

The privacy guard only retains DXCC aggregates when stored settings explicitly enable `showDxccStats`.

Remaining work:

- change the core/default UI default from enabled to disabled for brand-new installations.
- preserve/document existing installations' explicit preferences.

### 14. Station label/public home location privacy semantics — TODO

A public QSO path map necessarily exposes the configured rounded public home position. The station label should get a separate server-side publication permission.

Planned:

- add `publishStationName`, default off.
- omit `settings.stationName` from public JSON unless enabled.
- keep presentation `name=0` distinct from data publication permission.

### 15. DOM construction from QSO-derived values — TODO / low risk

Replace remaining data-derived `innerHTML` option construction with `new Option()` / `textContent`.

## Supply chain / repository

### 16. Main branch has no required status checks — OPS

Recommended repository policy:

- require pull requests before merging.
- require `security / node-security`.
- prevent force pushes and branch deletion.
- optionally require signed commits / linear history according to project preference.

### 17. Privacy regression tests — DONE

CI now covers:

- syntax checks and production dependency audit.
- production/development Compose validity and port-binding assertions.
- production image build/start and public/static smoke tests.
- private sentinel fields through the final public snapshot guard.
- fail-open LoTW snapshot rejection.
- public cache/asset privacy behavior.
- trusted-proxy replacement behavior.
- private/reserved/mapped-IP classification.
- LoTW confirmation-cap boundaries.

## Deployment files

Canonical files:

- `compose.prod.yaml` + `.env.production` — Internet-facing production through Caddy.
- `compose.dev.yaml` + `.env.development` — loopback-only local development/testing.
- `compose.yaml` + `.env` — hardened compatibility production path for existing installs.

Network policy for the canonical stacks is documented in `docs/NETWORK_BOUNDARY_HARDENING.md`.

Never reuse development credentials in production, never commit actual environment files, and review trusted-proxy settings whenever the reverse-proxy topology changes.
