## 1.9.9 - 2026-06-28

- Fix: Toggling a file from Preview back to Raw could occasionally steal focus to a different file's Preview tab when several files were open at once — `switchToRaw` now focuses the target Raw editor *before* closing the stale Preview tab, so VS Code's "focus the neighboring tab after a close" behavior can no longer redirect focus to the wrong file.
- Fix: Pressing Enter on a task list item in Preview mode no longer loses the checkbox syntax (`[ ]`) on the new empty item. The serializer was dropping `[ ]` for empty task items because `remark-preserve-empty-line` was excluded from the commonmark preset; re-enabling the plugin and stripping the resulting `<br />` placeholder in `postChange` and `normalizePreviewMarkdown` ensures the new item reaches the Raw editor as `- [ ] ` (with checkbox intact).

## 1.9.4 - 2026-06-24

- Fix: The caret no longer gets stuck on the focus-syntax markers (`**`, `` ` ``, etc.). The marker decorations are now `contenteditable="false"`, so arrow keys move past them instead of trapping the cursor inside the marker.
- Fix: Pressing Down/Up inside a table cell now moves to the cell directly below/above (same column) instead of jumping to the cell on the right. Multi-line cells still move the caret line-by-line first.
- Fix: Extending a selection with the keyboard (Shift+↑/↓ etc.) across a table boundary no longer breaks — the selection is normalized to include the whole table, matching mouse drag.
- Change: Removed the extra space below tables in Preview (`table` bottom margin is now 0).
- Add: The text cursor position is now carried over when toggling between Raw and Preview, so you land at the same place and can keep editing. (Mapped via top-level block index + in-block offset; exact for plain paragraphs/headings/lists, approximate around inline markup.)
- Change: The Preview/Raw toggle in the editor title bar is now mode-aware and pinned at the top — Raw shows a "Preview" button, Preview shows a "Raw" button. (A floating in-editor widget isn't possible for a plain text editor, so the title bar is the fixed-at-top spot.)
- Fix: Selecting multiple table cells no longer shows a messy native text-selection highlight on top of the cell overlay — only the clean cell highlight is shown.
- Fix: Blank lines between paragraphs are now preserved in Preview (and in the saved file). Previously they were collapsed, so `A` and `B` separated by a blank line became a single tight block; now the blank line stays as a visible gap. (List spacing is still tightened.)
- Change: Backspace at the start of a heading/checkbox/bullet now removes the marker **one step at a time**, like raw Markdown, instead of clearing it all at once: heading `H2 → H1 → paragraph`, checkbox `- [ ] → bullet → paragraph`, bullet `→ paragraph`.
- Add: Reorder table rows/columns from the floating table toolbar (↑ Row / ↓ Row / ← Col / → Col). The header row stays fixed.
- Fix: You can now un-format inline marks in Preview — at the edge of inline code/bold/italic/strikethrough/link, Backspace (closing side) / Delete (opening side) removes the mark (e.g. Backspace after `` `code` `` removes the code styling, keeping the text).
- Fix: Backspace at the start of a code block now converts it back to a paragraph (un-"```"), keeping the contents.
- Fix: Pressing `Cmd/Ctrl+A` twice in Preview now reliably selects the whole document. The "select all" stage now dispatches an explicit `AllSelection` instead of delegating to the browser's native Select All (which was unreliable in the webview and could jump to the top line).
- Fix: Pasting into Preview no longer garbles the content. Markdown-aware clipboard handling (`@milkdown/plugin-clipboard`) is now enabled, so paste/copy round-trips as Markdown like Raw does.
- Fix: Triple-clicking inside a code block now selects only the clicked line instead of the whole block.
- Improve: Multi-cell table selection (drag across cells) is now clearly visible — the selected cells get an accent tint plus an inner border (previously the highlight was too faint to see).
- Fix: Code blocks in Preview are now syntax-highlighted reliably (e.g. Python shows as Python). Highlighting is applied as ProseMirror decorations instead of mutating the editable DOM, which the editor used to revert — so colors no longer disappear. Token colors follow the theme (dark-mode palette added).
- Add: Preview toolbar buttons for **Undo / Redo** (`Cmd/Ctrl+Z`, `Cmd/Ctrl+Shift+Z`), **Quote** (`Cmd+Opt+9`), and **Code block** (`Cmd+Opt+8`), with hover shortcut hints.
- Fix: External edits to the `.md` file (e.g. by an AI assistant or another tool) now reflect in the Preview WebView even when only Preview is open — a `FileSystemWatcher` picks up on-disk changes in addition to `onDidChangeTextDocument`.
- Add: "Scroll beyond last line" in Preview — you can now scroll the last line all the way up to the top of the viewport. The extra bottom space is excluded from the Raw⇄Preview scroll-sync math so positions stay aligned.

## 1.9.2 - 2026-06-22

- Add: "What's New" notification on update — links to the changelog / getting-started walkthrough so existing users see new features.
- Add: Getting-started walkthrough (`contributes.walkthroughs`) — Preview/Raw toggle, slash menu, shortcuts.
- Add: Preview top toolbar (heading / checkbox / numbered list / Export) with hover shortcut tooltips; right-aligned `Preview | Raw` toggle.
- Add: Preview ⇔ Raw toggle works both ways via `Cmd/Ctrl+Shift+.` (also from inside Preview).
- Add: Raw `Preview │ Raw` toggle shown above the first line (CodeLens), `preview.showToggleLineWidget`.
- Change: In Preview, the first `Cmd/Ctrl+A` now selects the whole current line (block); press again to select the entire document.
- Change: Larger, clearer heading size steps in Preview (H1–H6).
- Fix: Returning from Preview to Raw could switch to a *different* file when multiple previews were open — the toggle now uses the originating preview's own document URI (and the fallback no longer guesses when ambiguous).
- Fix: Git diff gutter in Preview no longer shows false "modified" (blue) bars for blocks that are unchanged in Raw — the HEAD base is now normalized the same way (`normalizePreviewMarkdown`) as the editor content (e.g. table-cell `<br>`).
- Add: English / Japanese localization that follows the VS Code display language (`vscode.env.language`). Host strings use `vscode.l10n`, the Preview WebView uses a small dictionary, and the walkthrough uses `package.nls`. Slash-menu descriptions are localized in both Raw (completion) and Preview. Source language is English with a Japanese overlay (see `docs/specifications/i18n-localization.md`).
- Change: Checkbox styling — clearer (higher-contrast) frame; checked items are dimmed with a strikethrough, and the strikethrough is removed while editing the focused line.
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
