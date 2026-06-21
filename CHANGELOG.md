## 1.9.2 - 2026-06-22

- Add: "What's New" notification on update — links to the changelog / getting-started walkthrough so existing users see new features.
- Add: Getting-started walkthrough (`contributes.walkthroughs`) — Preview/Raw toggle, slash menu, shortcuts.
- Add: Preview top toolbar (heading / checkbox / numbered list / Export) with hover shortcut tooltips; right-aligned `Preview | Raw` toggle.
- Add: Preview ⇔ Raw toggle works both ways via `Cmd/Ctrl+Shift+M` (also from inside Preview).
- Add: Raw `Preview │ Raw` toggle shown above the first line (CodeLens), `preview.showToggleLineWidget`.
- Change: Larger, clearer heading size steps in Preview (H1–H6).
- Chore: Marketplace metadata — keywords, categories, gallery banner.

## 1.8.5 - 2026-06-21

- Fix: Preview slash menu block inserts (`/table`, `/code`, etc.) replace the whole slash line via `applyPreviewSlash.ts` instead of partial inline replace.

## 1.8.4 - 2026-06-21

- Add: Preview heading Backspace downgrade — `# Title` → normal line `#Title`, then `#` deletable character-by-character (`headingBackspacePlugin`).

## 1.8.3 - 2026-06-21

- Remove: Preview floating toolbar (B / I / code / H1 / H2). Use `/` slash menu instead.
- Change: Preview default `fontSize` 15 → 13; reduced heading scale and padding for doc-like typography.
- Remove: `markdownInline.preview.showToolbar` setting.

## 1.8.2 - 2026-06-21

- Add: Preview focus-syntax display — Markdown markers (`##`, `**`, links, etc.) visible only on the focused block (`preview.showFocusSyntax`, default true).
- Add: Preview slash menu (`/`) with same commands as Raw (`preview.enableSlashMenu`, default true).

## 1.8.1 - 2026-06-20

- Change: `markdownInline.table.inlineWrap.enabled` default `false` → `true`.

## 1.8.0 - 2026-06-20

- Add: Preview code highlighting (highlight.js common), scroll sync via heading anchor, checkbox edits synced to Raw `[x]`.
- Add: Raw image thumbnails (`imagePreview.showThumbnail`) and table inline-wrap preview (`table.inlineWrap.enabled`).
- Add: Preview KaTeX (`preview.enableMath`), Mermaid (`preview.enableMermaid`), frontmatter panel (`preview.showFrontmatter`), transition fade (`preview.enableTransitions`).
- Add: Preview floating toolbar (removed in 1.8.3).

## 1.7.1 - 2026-06-20

- Change: Title bar shows only the **toggle target** button (Preview when in Raw, Raw when in Preview) instead of both buttons.

## 1.7.0 - 2026-06-20

- Fix: Preview `theme: auto` follows VS Code light/dark.
- Add: Preview image rendering with workspace-relative paths; link clicks open files or external URLs.
- Add: Preview code syntax highlighting (initial set of languages).
- Add: Raw `headingColorScheme` (default / monochrome / vibrant), `hideStrikethroughOnEdit`, checkbox CodeLens.
- Add: Raw image hover preview (`imagePreview.enabled`) and table inline-wrap hover (`table.inlineWrap.enabled`).

## 1.6.5 - 2026-06-20

- Change: Preview / Raw title-bar actions show icon and label together (`$(open-preview) Preview` / `$(open-preview) Raw`) instead of icon-only buttons.

## 1.6.4 - 2026-06-20

- Fix: Raw mode no longer hides markdown syntax (`##`, `**`, etc.). Marker conceal and live-preview styling apply only in Preview (Milkdown WYSIWYG) mode.
- Change: Preview / Raw title-bar buttons use the same `$(open-preview)` icon (distinguished by tooltip).

## 1.6.3 - 2026-06-20

- Fix: Preview / Raw buttons always visible together and always clickable (Raw was hidden in Preview mode). Icons changed to `$(open-preview)` / `$(code)` with clearer tooltips.
- Fix: `openRaw` finds the Preview tab more reliably when switching back to source.

## 1.6.2 - 2026-06-20

- Fix: Preview / Raw title-bar buttons not showing in Cursor. Use `editorLangId` (and `resourceExtname`) in menu `when` clauses instead of `resourceLangId` alone; remove command `enablement` that hid the actions; move buttons earlier in the title bar (`navigation@3`/`@4`); use distinct icons `$(eye)` / `$(file-code)`.

## 1.6.1 - 2026-06-20

- Change: Preview and Raw title-bar buttons are always shown side by side for Markdown files; the active mode is indicated by disabling the corresponding button (`enablement`).

## 1.6.0 - 2026-06-20

- Add: Preview / Raw toggle (docs/specifications/preview-raw-toggle.md). `Preview`/`Raw` buttons in the editor title bar (and `markdownInline.togglePreview` / `Cmd+Shift+M` / `Ctrl+Shift+M`) switch the same editor column between the Markdown source and a Milkdown-based WYSIWYG editor. Edits in Preview are written back to the document and auto-saved (debounce ~200ms); external Raw edits are pushed to an open Preview (debounce ~100ms). Theme, font, max width, editability, mode memory per file, and best-effort scroll-position sync are configurable via `markdownInline.preview.*` settings.

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
