# Script-Friendly Output Spec

## Summary
Provide a consistent, machine-readable output mode for all CLI commands so scripts can consume results without parsing human text. The mode suppresses interactive UX, uses stable JSON envelopes, and returns predictable exit codes.

## Goals
- Make every command scriptable with a single, consistent output contract.
- Ensure stdout is parseable and stable across versions.
- Keep human-friendly logs and progress out of stdout.
- Provide explicit, typed error objects with actionable metadata.
- Preserve existing human-first output as the default.

## Non-Goals
- Replace the existing human-readable CLI experience.
- Change data schemas returned by APIs or database exports.
- Add new command behaviors beyond output formatting.

## User Stories
- As a user, I can pipe `xgpt` results into `jq` without brittle parsing.
- As a CI job, I can reliably detect failure cause and exit code.
- As an automation script, I can stream progress without scraping logs.
- As a developer, I can rely on a versioned schema for changes.

## Proposed Interface
### Global Flags
- `--script` (boolean): Enable script-friendly mode.
- `--output <format>`: Output format. Default `json` in script mode.
  - Supported: `json`, `jsonl`, `csv`, `markdown`, `txt` (matching config schema).
- `--no-color`: Disable ANSI coloring (forced on in script mode).
- `--no-progress`: Disable progress bars/spinners (forced on in script mode).
- `--quiet`: Suppress non-fatal warnings to stderr (optional).

### Environment
- `XGPT_SCRIPT_MODE=1` enables script mode.
- `XGPT_OUTPUT=json|jsonl|csv|markdown|txt` overrides default format.

### Compatibility
- Existing per-command `--json` remains supported and maps to `--script --output json`.
- Existing config `output.format` is used when script mode is enabled without explicit flags.

## Output Contract
### Envelope (JSON)
All script outputs are wrapped in an envelope for consistency.

Success:
```json
{
  "success": true,
  "command": "search",
  "data": { /* command-specific payload */ },
  "warnings": [
    { "code": "PARTIAL_RESULTS", "message": "Some items were skipped." }
  ],
  "meta": {
    "schemaVersion": 1,
    "timestamp": "2026-01-23T21:04:05Z",
    "durationMs": 1234,
    "version": "1.8.0",
    "sessionId": 42
  }
}
```

Error:
```json
{
  "success": false,
  "command": "search",
  "error": {
    "type": "ValidationError",
    "code": "INVALID_ARGUMENT",
    "message": "Missing required argument: query",
    "details": { "arg": "query" },
    "actions": [
      { "description": "See usage", "command": "xgpt search --help" }
    ]
  },
  "meta": {
    "schemaVersion": 1,
    "timestamp": "2026-01-23T21:04:05Z",
    "durationMs": 12,
    "version": "1.8.0"
  }
}
```

### JSONL Streaming (Optional)
When `--output jsonl` is used, each line is a JSON object with an `event` field:
- `event: "start"` includes command + meta
- `event: "progress"` includes incremental updates
- `event: "data"` includes partial results
- `event: "end"` includes summary envelope

Example:
```json
{"event":"start","command":"scrape","meta":{"timestamp":"..."}}
{"event":"progress","percent":10,"message":"Fetching tweets"}
{"event":"data","tweet":{"id":"..."}}
{"event":"end","success":true,"meta":{"durationMs":120000}}
```

### Stdout/Stderr Rules
- **Stdout**: only machine-readable output for script mode.
- **Stderr**: progress indicators, warnings (unless `--quiet`), and debug logs.

## Exit Codes
- `0`: Success
- `1`: Runtime error (network, API, unexpected)
- `2`: Validation/usage error (missing args, invalid flags)
- `3`: Authentication/authorization error
- `4`: Rate limit/temporary unavailable

Exit codes must match the `error.code` mapping.

## Command-Specific Data Guidelines
- `data` must be a single object (not arrays at top-level) to allow expansion.
- Prefer stable IDs and avoid human-only text in fields used for parsing.
- Include pagination or cursor info if available.

## Logging and Progress
- In script mode, default log level becomes `warn` and progress bars are disabled.
- `--verbose` continues to add detail to stderr only.

## Migration Notes
- Commands that already return JSON (search, users discover) should wrap existing result objects inside the envelope without changing fields.
- Human-readable output remains unchanged when script mode is off.

## Documentation Updates
- Add section to `docs/usage.md` and `README.md` describing `--script` and output formats.
- Add `script-friendly-output` examples to `docs/commands.md`.

## Test Plan
- Unit tests for envelope formatting and exit codes.
- Integration tests for `--script` on each command:
  - stdout is valid JSON
  - stderr contains progress/logs only
  - exit code matches error type
- JSONL streaming test with start/progress/end events.

## Open Questions
- Should `--script` also disable prompts and require all arguments?
- Should `output.format` allow `jsonl` (currently not in config schema)?
- Should error `details` include stack traces when `--verbose` is set?
