# Completion gate

For a code change, run from the repository root:

1. `npm ci --ignore-scripts`
2. `npm run check`
3. `npm run audit:prod`
4. If deployment or HTTP behavior changed, run the relevant Docker Compose validation and endpoint/static-output checks from `.github/workflows/security.yml`.
5. Inspect `git diff`, `git status --short`, and verify no runtime `.env*` or `data/` secrets were added.

A change is not complete if the privacy regression scripts, network guard tests, or privacy-default tests fail. Keep public snapshot behavior fail-closed and preserve atomic write semantics.

Command inventory: `mem:suggested_commands`; architecture and boundaries: `mem:core`; style/pattern constraints: `mem:conventions`.