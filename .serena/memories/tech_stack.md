# Runtime and dependencies

- JavaScript/CommonJS Node.js application; engine requirement Node >=22.
- Package manager: npm; lockfile `package-lock.json` is tracked and CI uses `npm ci --ignore-scripts`.
- Runtime dependencies: Express 5.2.x, Multer 2.2.x, topojson-client 3.1.x, world-atlas 2.0.x.
- No TypeScript, build bundler, formatter, or linter is declared in `package.json`.
- Deployment targets are Docker Compose production/development variants with a hardened non-root image; environment templates are tracked while runtime env files are ignored.

For application layout and privacy boundaries, read `mem:core`; for exact project commands, read `mem:suggested_commands`.