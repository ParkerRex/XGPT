# Agent Guidelines

See [CLAUDE.md](./CLAUDE.md) for coding conventions and project architecture.

## File Operations

- Delete unused files when your changes make them obsolete
- Never delete files to resolve type/lint errors without user approval
- Never edit `.env` or environment variable files
- Coordinate before reverting or deleting work you didn't author

## Git Operations

- Always check `git status` before committing
- Keep commits atomic—only include files you touched
- Quote paths with brackets/parentheses (e.g., `"src/app/[id]/**"`)
- Never amend commits without explicit approval
- Never run destructive operations (`git reset --hard`, `git checkout` to older commits) without explicit user instruction
- For rebase, disable editors: `GIT_EDITOR=: GIT_SEQUENCE_EDITOR=:`

**Commit format:**
```bash
# Tracked files
git commit -m "<scoped message>" -- path/to/file1 path/to/file2

# New files
git restore --staged :/ && git add "path/to/file1" && git commit -m "<message>"
```

## Code Style

*   Only create an abstraction if it's actually needed.
*   Prefer clear function/variable names over inline comments.
*   Avoid helper functions when a simple inline expression would suffice.
*   Use `knip` to remove unused code if making large changes.
*   The `gh` CLI is installed, use it.
*   Don't use emojis.

## React
*   Avoid massive JSX blocks and compose smaller components.
*   Colocate code that changes together.
*   Avoid `useEffect` unless absolutely needed.

## Tailwind
*   Mostly use built-in values, occasionally allow dynamic values, rarely globals.
*   Always use v4 + global CSS file format + shadcn/ui.

## Next
*   Prefer fetching data in RSC (page can still be static).
*   Use next/font + next/script when applicable.
*   next/image above the fold should have `sync` / `eager` / use `priority` sparingly.
*   Be mindful of serialized prop size for RSC → child components.

## TypeScript
*   Don't unnecessarily add `try`/`catch`.
*   Don't cast to `any`.


