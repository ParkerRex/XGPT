# Auth Resolution and Cookie Extraction

## Goal
Reduce setup friction by automatically resolving usable X/Twitter auth credentials with a clear, observable precedence order.

## Background
Current flows rely on manually set tokens. Onboarding improves when the CLI can discover cookies from common browsers and explain what it is using.

## User Stories
- As a new user, I want the CLI to discover valid auth automatically so I can run a scrape without manual cookie hunting.
- As a power user, I want explicit flags to override everything for deterministic automation.
- As a cautious user, I want to know exactly where auth was sourced from without exposing secrets.

## Scope
- Applies to all commands that require authenticated X/Twitter access.
- Works on macOS, Linux, and Windows where feasible.
- Supports Chrome, Firefox, and Safari cookie extraction.

## Requirements
- Resolve auth in this order:
  1) CLI flags
  2) Environment variables
  3) Config file
  4) Browser cookies
- Provide a single shared resolver used by all commands that require auth.
- Add `xgpt auth check` to print resolved sources, missing pieces, and suggested actions.
- Support browser selection and profile targeting for Chrome, Firefox, and Safari.
- Respect timeouts and fail with actionable errors.
- Never log or persist raw token values.

## CLI and Config
- Global flags:
  - `--auth-token`, `--ct0`
  - `--cookie-source` (chrome|firefox|safari|auto)
  - `--chrome-profile`, `--chrome-profile-dir`
  - `--firefox-profile`
  - `--cookie-timeout`
- Add `xgpt auth check` and `xgpt auth check --json`.
- Optional: `xgpt auth check --list-profiles` to show discoverable browser profiles.
- Add config defaults for the above where appropriate.

## Behavior
- CLI flags always override everything else.
- If resolved credentials are incomplete, commands fail with a specific auth error.
- `xgpt auth check` never scrapes; it only validates and reports.
- Default validation is local-only (presence/format). Optional `--validate` can run a lightweight request to confirm live validity.

## Resolution Algorithm
1) Collect candidates from flags, env, config, then cookies.
2) Prefer the highest-precedence source that yields both `auth_token` and `ct0`.
3) If only one token is present at a given tier, continue to lower tiers to fill missing fields, but record mixed sources.
4) If no complete set is found, return a structured auth error with remediation.

## Cookie Extraction Details
### Domains
- Accept cookies for both `x.com` and `twitter.com` domains.
- Prefer the most recently updated `auth_token` and `ct0` pair from the same browser/profile.

### Default Paths
- macOS:
  - Chrome: `~/Library/Application Support/Google/Chrome/`
  - Firefox: `~/Library/Application Support/Firefox/Profiles/`
  - Safari: `~/Library/Cookies/Cookies.binarycookies` and `~/Library/Containers/com.apple.Safari/Data/Library/Cookies/Cookies.binarycookies`
- Windows:
  - Chrome: `%LOCALAPPDATA%\\Google\\Chrome\\User Data\\`
  - Firefox: `%APPDATA%\\Mozilla\\Firefox\\Profiles\\`
  - Safari: not supported
- Linux:
  - Chrome: `~/.config/google-chrome/`
  - Firefox: `~/.mozilla/firefox/`
  - Safari: not supported

### Profile Selection
- If `--chrome-profile` / `--firefox-profile` is provided, use it exclusively.
- Otherwise, prefer `Default` / `Profile 1` then most recently updated profile.
- If `--chrome-profile-dir` is provided, bypass default path discovery and search that directory only.

## Output Examples
### `xgpt auth check`
- Source summary with redacted tokens: last 4 characters only.
- Explicit warnings for missing tokens.

Example (plain):
```
Auth sources:
- auth_token: env (****abcd)
- ct0: chrome:Default (****wxyz)
Status: OK (mixed sources)
```

## Security and Privacy
- Never print or log full tokens.
- Do not persist tokens to disk.
- In debug logs, redact all token-like values.
- Prefer in-memory handling and zero-copy where possible.

## Non-Goals
- Login automation or password-based auth.
- Cookie manipulation or writing to browser stores.

## Implementation Notes
- Add `src/auth/credentials.ts` with a single `resolveCredentials()` entry point.
- Update scrape/search/discover/interactive flows to use the resolver.
- Extend error handling with a dedicated auth check error path.
- Add `src/auth/cookies/*.ts` for per-browser extraction logic.
- Add structured auth result type: `{ authToken, ct0, source, warnings }`.

## Acceptance Criteria
- All auth-using commands work with flags, env, config, or cookies alone.
- `xgpt auth check` reports source and validity for each token.
- Missing tokens produce actionable guidance.
- Tokens are redacted in all user-visible output.

## Risks
- Browser profile discovery can be brittle; provide explicit profile flags.
- Some environments may block cookie access; ensure failures are explicit and safe.
- Safari cookie storage may require additional permissions on macOS.

## Test Plan
- Unit tests for resolver precedence and mixed-source resolution.
- Fixture tests for cookie parsing across supported browsers.
- Manual smoke test: `xgpt auth check --validate` on each OS where possible.
