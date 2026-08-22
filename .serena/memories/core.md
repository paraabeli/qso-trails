# qso-trails source map and invariants

- Node.js service entrypoint: `server.js`; startup preloads privacy/network/default layers before `server.js` via `package.json` scripts.
- Server keeps private state under `data/`; public output is the sanitized `public-snapshot.json` consumed by `/api/public`, `/embed`, and `/static/qrz.png`.
- Security/privacy behavior is layered through preload modules: `privacy-guard.js`, `network-guard.js`, `privacy-defaults.js`, `static-publish.js`, and `lotw-feature.js`.
- Browser assets live under `public/`; fixture/regression checks live under `test/`; deployment and hardening decisions live under `docs/`.
- Public payload invariant: raw Wavelog/ADIF data, tokens, and internal/private fields never reach public endpoints; coordinate rounding and opt-in fields are server-side.
- Review dependency/runtime details in `mem:tech_stack`; commands and acceptance checks in `mem:suggested_commands` and `mem:task_completion`; project-specific patterns in `mem:conventions`.