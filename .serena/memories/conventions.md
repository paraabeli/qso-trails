# Project conventions and boundaries

- Keep CommonJS modules and semicolon-terminated JavaScript consistent with existing files; avoid introducing a second module system without a migration plan.
- Privacy enforcement is intentionally defense-in-depth: preload wrappers intercept selected Express/fs/fetch behavior, while final snapshot sanitization remains fail-closed and atomic.
- Public data shaping must be explicit: server-side settings control optional fields; presentation URL parameters are not privacy permissions.
- Network calls to Wavelog must preserve HTTPS/private-address/redirect protections, DNS pinning, response-size caps, and confirmation-record caps.
- Admin and public routes have distinct headers, caching, authentication/CSRF, and rate-limit policies; changes to route registration or Express application hooks require regression checks.
- Treat `data/` as runtime/private state and do not add secrets or environment files; consult `SECURITY.md` and `docs/SECURITY_PRIVACY_HARDENING.md` for security-sensitive changes.

Architecture/source map: `mem:core`; runtime details: `mem:tech_stack`.