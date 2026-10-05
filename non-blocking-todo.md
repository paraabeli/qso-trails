# Non-blocking todo

Findings that are real but not blocking a release, recorded here so they are not
lost in review comments. Each entry names the evidence and a concrete next step.

## Architecture

- **The preload monkey-patching remains.** `privacy-guard.js`,
  `privacy-defaults.js`, `lotw-feature.js`, `static-publish.js`,
  `static-theme-pack.js` and `admin-diagnostics.js` still override Express/fs/fetch
  internals. The public-snapshot build is now explicit (see
  `docs/PRELOAD_CONTRACT.md`) and the `fs.writeFile` guards are backstops only,
  but the remaining `express.application.*` wrapping is still order-sensitive.
  Next step (larger refactor): move route registration and response shaping into
  normal middleware/router modules so preloads are not needed for correctness.
- **`public/admin-publish.js` appears unused.** It is not referenced by
  `public/admin.html` (which loads `dom-safety.js`, `admin-privacy.js`,
  `admin.js`, `admin-lotw.js`). It also sets `h.style.marginBottom`, which the
  strict Admin CSP (`style-src 'self'`) would block if it were loaded. Next
  step: confirm dead and delete, or wire it up and make it CSP-safe.

## Security / correctness

- **`npm run audit:prod` fails on transitive dependencies (pre-existing).**
  `multer` (high), `qs` (moderate) and `ip-address` (moderate, via
  `express-rate-limit`) have advisories. No direct dependency or the lockfile was
  changed here; Dependabot already has open branches for `multer` 2.4.0 and
  `express-rate-limit` 8.7.0. Next step: take the Dependabot bumps and re-run
  `npm run audit:prod` (it is a CI gate, so this is currently red on `main`).

- **Admin auth lockout is per-IP and shared with valid logins.** After 10 failed
  attempts from an IP, even correct credentials get 429 for the window
  (`auth-failures.js`). Acceptable for a single-admin self-hosted tool; consider
  exempting successful credential checks from the pre-check if that ever bites.
- **The `fs.writeFile` snapshot backstop is not double-harden safe.** If a future
  change routes a snapshot write through the patches, `hardenPublicSnapshot`
  would run twice and the second pass rejects a LoTW-confirmed-only snapshot as
  fail-open. This is fail-closed, but it would be a confusing failure. Next step:
  make the backstop validate-only rather than transform.
- **Embed CSP `unsafe-inline` removal is verified by grep + CI, not by a headless
  browser.** `test/integration-server.js` asserts the header; the CI smoke test
  asserts no inline styles in the embed sources. A headless CSP-violation check
  would be stronger.

## DX

- **No formatter/linter (deliberate).** Documented in `AGENTS.md` and
  `docs/DEVELOPMENT.md`. Revisit only with a migration plan.
- **Node version drift.** `.nvmrc` and `engines` now say 24; Docker and CI pin
  24.19.0. Dependabot has an open branch for Node 26 — decide when to move.
- **CI pins the asset cache-bust stamp dynamically now**, but the smoke test
  still reads it from `public/embed.html`/`admin.html` via grep. If the HTML
  structure changes, update both the resolve step and
  `scripts/check-asset-versions.js`.
