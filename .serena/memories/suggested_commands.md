# Commands

- Install reproducibly: `npm ci --ignore-scripts`.
- Syntax + regression checks: `npm run check` (Node syntax checks for server, preload layers, browser modules, and tests, then runs the three regression scripts).
- Start local service: `npm start`; development watch mode: `npm run dev`.
- Production dependency audit: `npm run audit:prod`.
- CI also validates Compose files, Docker build/start, endpoint smoke behavior, asset blocking, no-store headers, and static PNG outputs; inspect `.github/workflows/security.yml` before changing deployment behavior.

`npm run check` is the default local acceptance command; see `mem:task_completion` for the full completion gate.