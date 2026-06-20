## 1.5.0 - 2026-06-20

- Change: `markdownInline.advanced.autoFormatTables` now defaults to `false`. Tables are no longer auto-formatted when moving off a table line unless explicitly enabled; the `Format Markdown Table` command and `/table` slash command are unaffected.

## 1.4.9 - 2026-03-09

- Fix: In Markdown tables, the first `Cmd+A`/`Ctrl+A` now selects the current cell contents before expanding to the row and then the whole document.
- Test: Added integration coverage for table-cell smart select all behavior.
- Chore: Bound `markdownInline.smartSelectAll` to `Cmd+A`/`Ctrl+A`.

## 1.3.1 - 2025-10-11

- Fix: Table auto-format didn’t run due to an undefined `document` reference in selection change handler.
- Fix: Skip table formatting inside fenced code blocks (```), preventing accidental reformatting.
- Chore: Simplify runtime settings application to avoid writing unsupported `[markdown]` keys; only disable conflicting markdown extension features.

## 1.3.0

- Initial packaged version tracked in this repository
