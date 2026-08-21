# Network Boundary Hardening

This document describes the second post-audit security patch for QSO Trails. It focuses on client-IP trust at the reverse-proxy boundary and outbound Wavelog requests.

## Trusted reverse proxy model

QSO Trails no longer relies on the core server's fixed `trust proxy = 1` behavior. `network-guard.js` is loaded before the server and replaces that assignment with the `TRUST_PROXY` policy.

Canonical production uses:

```text
TRUST_PROXY=loopback,uniquelocal
```

This matches the supported Docker topology:

```text
Internet
   |
   v
Caddy :443
   |
Docker private network
   |
   v
QSO Trails :3000 (not published on host)
```

Only loopback/private proxy addresses are trusted to supply forwarded client-address information. A direct public client address is not trusted merely because it sends `X-Forwarded-For`.

Canonical development uses:

```text
TRUST_PROXY=false
```

because the browser connects directly to the loopback-bound application port.

If an operator adds Cloudflare, another reverse proxy, Kubernetes ingress, a load balancer, or changes Docker networking, the trust policy must be reviewed. Do not set `TRUST_PROXY=true` on an Internet-facing application.

## Wavelog connection pinning

The core application already checks Wavelog hostnames before requests. The network guard adds a second check at the actual fetch boundary and pins the outgoing connection to an address from that validated DNS result.

For each `/api/v2/qso` or `/api/v2/confirmation` request:

1. Resolve all current A/AAAA results immediately before connecting.
2. Normalize IPv4-mapped IPv6 addresses such as `::ffff:127.0.0.1`.
3. When `ALLOW_PRIVATE_WAVELOG=false`, reject the request if any returned address is private, loopback, link-local, documentation/reserved, multicast, or otherwise blocked by policy.
4. Select one validated address.
5. Connect to that exact address through a custom Node `http`/`https` DNS lookup callback.
6. Preserve the original Wavelog hostname for the HTTP Host header and TLS SNI/certificate validation.
7. Reject HTTP redirects rather than forwarding the Bearer token to another location.

The important property is that DNS is not consulted again by the socket after validation. A hostname cannot pass validation with one address and then cause the same request to connect to a newly rebound private address.

If `ALLOW_PRIVATE_WAVELOG=true` is intentionally enabled, private destinations are permitted by design. HTTPS is still required unless `ALLOW_INSECURE_WAVELOG=true` is also explicitly enabled.

## IPv4-mapped IPv6

Mapped forms are normalized before address policy checks. For example:

```text
::ffff:127.0.0.1 -> 127.0.0.1 -> blocked
::ffff:10.1.2.3   -> 10.1.2.3   -> blocked
```

This prevents a private IPv4 destination from bypassing the policy by appearing in IPv6-mapped notation.

## Response-size limit

Every guarded Wavelog response is capped before it is buffered in memory.

Canonical value:

```text
WAVELOG_MAX_RESPONSE_BYTES=16777216
```

which is 16 MiB per API response. The guard aborts the request if this limit is exceeded.

The environment variable is bounded internally to 1–64 MiB to prevent accidental extreme values.

## LoTW confirmation total cap

Confirmation synchronization requests 1,000 records per page. The guard refuses pages whose first possible record is beyond:

```text
WAVELOG_CONFIRMATION_MAX_RECORDS=500000
```

With the standard 1,000-record page size, pages 1–500 are permitted and page 501 is rejected. The existing LoTW refresh logic catches the error and retains the previous successful confirmation cache, so an oversized/broken upstream does not replace known-good confirmation state.

The internal configuration is bounded from 1,000 to 2,000,000 records.

## Failure behavior

Network hardening failures are fail-closed for the Wavelog request:

- unsafe DNS result -> request rejected
- redirect -> request rejected
- response too large -> request aborted
- confirmation cap exceeded -> confirmation refresh rejected
- TLS certificate/hostname failure -> request rejected by Node TLS

Normal public rendering continues from the last locally stored/sanitized state. A Wavelog network failure does not grant additional public access.

## Tests

`test/network-guard.js` verifies at least:

- IPv4 loopback/private/link-local ranges are blocked
- IPv4-mapped loopback is normalized and blocked
- IPv6 ULA/link-local/documentation ranges are blocked
- known public IPv4/IPv6 examples are not classified as private
- confirmation page 500 at 1,000/page is allowed under the default cap
- page 501 is rejected
- direct/dev mode forces Express `trust proxy` to `false`
- production policy replaces the old hop-count value with `loopback,uniquelocal`

The standard security workflow runs these tests through `npm run check` before building the production image.
