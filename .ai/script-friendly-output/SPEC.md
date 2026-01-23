# Script-Friendly Output and JSON Schema

## Goal
Make CLI outputs stable, machine-readable, and consistent across commands.

## Background
Current output mixes human logs with data. Automation improves when JSON is consistent and plain output is available.

## Requirements
- Standardize `--json` output across commands with a shared envelope.
- Provide `--plain` and `--no-color` options; honor `NO_COLOR=1`.
- Publish a JSON schema doc for tweets, users, sessions, and results.

## JSON Envelope
- For non-paginated results:
  - `{ success, data, error }`
- For paginated results:
  - `{ success, data, nextCursor, error }`

## CLI and Config
- Global flags: `--json`, `--plain`, `--no-color`.
- Config: `output.format` and `output.plain` defaults.

## Behavior
- Human-readable output remains the default.
- `--plain` removes progress bars, emoji, and ANSI color.

## Non-Goals
- Replacing all logs with JSON when not requested.
- Breaking existing text output in default mode.

## Implementation Notes
- Add `src/utils/output.ts` to format responses consistently.
- Update commands to return structured data and print via a shared formatter.
- Add `docs/json-schema.md` with examples and schema.

## Acceptance Criteria
- `--json` output is valid JSON and consistent across commands.
- `--plain` output contains no ANSI codes.
- Schema documentation exists and matches actual output.

## Risks
- Existing scripts may rely on current unstructured output; keep defaults unchanged.
