## 1.9.10 - 2026-07-01

- Add: `markdownInline.toggleLineNumbers` command — toggles `preview.showLineNumbers` directly from the Command Palette, so you don't need to open Settings UI and search for the setting ID just to flip it.
- Change: `markdownInline.preview.showLineNumbers` now defaults to **on** — the Preview line-number gutter (source Markdown line number at the left of each block) was gated behind a default-off setting since 1.9.9, so switching from Raw (where VS Code's own line numbers are always visible) to Preview made the numbers silently vanish. The default in code is resolved through the shared `resolveShowLineNumbers` helper so the `package.json` declaration and the host fallback can no longer drift apart (guarded by `test/suite/shared/markdownInlineSettings.test.ts`).
- Fix: Starting a mouse drag on a bullet/ordered list marker in Preview selected nothing — `@milkdown/components`'s `list-item-block` calls `preventDefault()` on the marker's `pointerdown` unconditionally (even for non-checkbox markers), which per the Pointer Events spec suppresses the follow-up `mousedown` that ProseMirror's native drag-selection depends on; the marker is also `contenteditable="false"`, so even a real `mousedown` there wouldn't let the browser's native selection extend from it. `listMarkerDragFixPlugin.ts` intercepts the marker's `pointerdown` in the capture phase (bullet/ordered only — checkbox click-to-toggle is untouched) and manually drives the drag selection (anchor at the item's content start, extended via `mousemove` + `posAtCoords`).
- Fix: Dragging to select text in one block while a different block (typically the first heading, auto-expanded on open) still had its Typora-style focus-expansion prefix showing could end with an empty selection — every selection change mid-drag triggered `blockPrefixEditPlugin` to collapse the other block immediately, and that document mutation invalidated the browser's native selection anchor being tracked for the drag. Expand/collapse syncing is now deferred while the mouse button is held and reconciled once after `mouseup` (itself deferred one tick, since a plain click's native `selectionchange` isn't always synced back into ProseMirror's state by the time `mouseup` fires).
- Fix: Copying a selection in Preview that included a table cell's line break put a literal `<br>` into the clipboard's text/plain instead of an actual newline — the storage-format hardbreak serializer (`overrideHardbreakSerializer`, needed because GFM table cells can't hold a literal newline) was also being reused verbatim by `@milkdown/plugin-clipboard`'s copy path. A new plugin (`clipboardPlainTextPlugin.ts`, registered ahead of `clipboard` so ProseMirror's first-match `someProp` picks it) reuses the same serialization but converts the resulting `<br>` markers back into real newlines before they reach the clipboard.
- Fix: Focusing (not editing) a heading/list-item/blockquote whose content starts with a link (e.g. `- [1. Section](#anchor)`) inserted the Typora-style focus-expansion prefix *inside* the link instead of before it (rendered as `[- 1. Section](#anchor)`), because `blockPrefixEditPlugin`'s `expandBlock` used `tr.insertText`, which inherits the marks of the position it's inserted at — here, the adjacent link mark. It now inserts an explicit markless text node instead.
- Fix: The Preview Git-diff gutter could show a block as "modified" (blue bar) just from placing the cursor in it — with no actual edit. The Typora-style focus-expansion feature (`blockPrefixEditPlugin`) inserts the block's Markdown marker (`## `, `- `, `> `) as real text the moment a heading/list-item/blockquote gets focus, and the diff gutter compared that inflated live text directly against the unexpanded Git HEAD signature. `blockSignatures()` now accepts the currently-expanded prefix's position range and excludes it from the comparison. Found by the new `test/webview/previewDiffFocusExpand.integration.test.ts`.
- Change: The editor title-bar Preview/Raw toggle now uses a single, mode-independent icon (`markdownInline.togglePreview`, `$(book)`) instead of two different icon/command pairs (`$(open-preview) Preview` in Raw, `$(code) Raw` in Preview) that swapped depending on the active mode.
- Fix: KaTeX math (`$...$` / `$$...$$`) never actually rendered in Preview — the old `katex/contrib/auto-render` post-processing rewrote ProseMirror-managed DOM from the outside, so ProseMirror's MutationObserver immediately reverted it (the same failure class as the Mermaid bug fixed earlier this release). Re-implemented as a decoration plugin (`mathDecorationPlugin.ts`): while the cursor is outside a formula the `$` source is hidden and the KaTeX-rendered result is shown in its place; putting the cursor on it switches back to the editable source (Typora-style). Found by the new `test/browser/mathRendering.test.ts`; see `docs/specifications/math-decoration-rendering-fix.md`.
- Fix: Preview slash-menu items that create an empty block were broken — `/todo` produced a literal `[ ]` paragraph instead of a checkbox, and `/h1`–`/h6`, `/quote`, `/bullet` etc. deleted the line entirely and dumped subsequent typing into the neighboring block. Two combined causes: empty-body markdown (`## `, `- [ ] `) degrades under parsing, and `markdownToSlice` returns an *open* slice whose block wrapper gets stripped by `tr.replace`. The apply step now parses with an invisible placeholder character (removed right after, leaving the cursor there) and closes the slice to depth 0. Found by the new `test/browser/slashMenuDom.test.ts`; see `docs/specifications/preview-slash-empty-block-fix.md`.
- Fix: While editing in Preview, an external update to the same file (Raw editor, AI, other tools) could throw the cursor into the externally edited/added line — continuing to type then spliced your text into the external content. `applyExternalContent` used to rebuild the whole document and clamp the selection as a raw number, which drifts whenever anything before the cursor changes size. It now parses the incoming markdown and replaces only the top-level blocks that actually changed (block identity judged by per-block markdown serialization, not strict node equality, since typed and parsed nodes differ in internal attrs), letting ProseMirror's mapping keep the cursor in place. Found by the new `test/browser/externalUpdateRace.test.ts`; see `docs/specifications/external-update-cursor-jump-fix.md`.
- Test: Closed the remaining spec-coverage gaps with five new real-Chromium suites (23 tests): KaTeX math rendering, slash-menu DOM interaction (open → filter → confirm → cursor placement), the frontmatter panel (display, toggling, external-update follow-up), external-update-vs-editing races, and Japanese IME × checkbox combinations (via CDP composition events). Three of the five uncovered the real bugs above.
- Fix: Unsaved (dirty) edits made in Raw mode were silently discarded when switching to Preview — the tab replacement/close during the switch made VS Code revert the text model to the on-disk content, so toggling back to Raw showed the file as it was before the edit. `switchToPreview` now saves the document first (matching Preview's existing save-on-every-keystroke design), so there is nothing left to lose when the revert happens. Untitled documents are excluded (they have no disk copy to revert to, and `save()` would pop a blocking "Save As" dialog). Found by the new real-VS-Code usage-flow test 12.3; see `docs/specifications/dirty-raw-edit-preview-switch-loss-fix.md`.
- Test: Added a real-VS-Code usage-flow suite (`test/extension/preview.test.ts`, section 12) — Raw⇄Preview round-trip leaves the file byte-identical and non-dirty, an external tool rewriting the file while Preview is open doesn't kill the tab, dirty Raw edits survive the Preview round-trip, repeated `openWith` doesn't multiply Preview tabs, and `togglePreview` on a non-Markdown file is a safe no-op.
- Test: Added a real-Chromium usage-flow suite (`test/browser/usageFlows.test.ts`, 13 tests) reproducing everyday writing flows end-to-end with real keystrokes: rapid shopping-list entry (checkbox + Enter repetition), mixing plain bullets and checkboxes in one list, meeting-note structure (heading → checklist → heading → checklist), back-to-back checkbox conversions, checkbox at the very top of the document, Cmd+Z right after a conversion, abandoning and re-completing a task marker via Backspace, blur/refocus mid-entry, select-lines-delete-Undo restoring checked states, paragraph split/join, heading Enter, bullet-item split, and checkbox syntax typed inside a table cell staying literal.
- Test: All test titles across every tier are now auto-collected into `docs/specifications/preview-test-catalog.md` (a living use-case spec; regenerate with `npm run docs:test-catalog`), and `docs/specifications/spec-test-coverage.md` maps each spec document to the tests that guard it (with known gaps listed). The extension-host runner also accepts `MOCHA_GREP` to run a subset of the real-VS-Code tests.
- Test: Reorganized the test tree by domain — `test/suite/` is now split into `preview/`, `raw/`, and `shared/`, and the single 1,400-line `test/extension.test.ts` is split into `test/extension/raw.test.ts` + `test/extension/preview.test.ts` (both still run inside one single VS Code launch per `npm test` invocation).
- Add: `markdownInline.preview.alwaysOpenNewTab` (default: on) — always opens files in a brand-new tab instead of reusing VS Code's single-click "preview" tab. Directly toggles the built-in `workbench.editor.enablePreview` setting (a global VS Code setting, so it also affects non-Markdown files when enabled).
- Add: `markdownInline.preview.wordWrap` (default: on) — word-wraps Markdown files by default instead of horizontal scrolling. Directly sets `editor.wordWrap` to `"on"` scoped to the Markdown language (`[markdown]` override), so other languages are unaffected.
- Fix: Typing quickly in Preview (e.g. inside a checkbox item or a plain paragraph, mid-line) could occasionally make the cursor jump to a different line. Each keystroke's write-back to the document (`WorkspaceEdit` + save) now runs strictly one at a time (`createSerialQueue`) instead of overlapping, so a fast keystroke can no longer build its diff against a stale, not-yet-written document state.
- Fix: Converting a line to a checkbox in Preview (⌥⌘4 or the toolbar's checkbox button), when any other block already existed elsewhere in the document, could occasionally move the cursor to that unrelated block instead of staying on the converted line. The wrap-into-list and checked-attribute-set steps now run as a single transaction/dispatch instead of two, so the checkbox's Web Component no longer briefly re-mounts mid-operation and loses the browser's native text selection.
- Fix: Editing in Preview (most noticeable in table cells) could occasionally throw the cursor to the very end of the document. The file-system-watcher fallback that detects external `.md` edits now compares the disk content against what was just written (same content-based echo check `onDidChangeTextDocument` already had), so a delayed echo of its own save can no longer be misread as fresh external content and pushed over an in-progress edit.
- Fix: Switching from Preview to Raw right after typing could occasionally lose the most recent edit. `switchToRaw` now waits for any writes still queued from the webview to finish before tearing down the Preview panel, instead of racing ahead of them.
- Fix: `renumberLists` stopped renumbering at the first blank line in either direction, even when it only separated two nested sibling items of the same sublist — a stray blank line inside a nested list left later items and the parent's own numbering un-renumbered. It now bridges a single blank line when it sits between nested (indented) list lines, while still treating a blank line between top-level items as a real list boundary (unchanged).
- Fix: `/table normalize on|off` silently failed to take effect when editing a file with no workspace folder open, because writing the setting at workspace scope throws in that case. It now falls back to the user (global) setting when no workspace is open, and no longer lets a persistence failure block the immediate in-session effect.
- Fix: Pressing Cmd/Ctrl+A a 4th time (after a table or code block was already fully selected) sometimes failed to select the whole document. It no longer delegates to VS Code's native "Select All" command (which can no-op without real window focus) and instead sets the whole-document selection directly, matching how the other selection stages already work.
- Fix: Mermaid diagrams in Preview never rendered at all — the code looked for `pre code.language-mermaid`, but Milkdown actually renders code blocks as `<pre data-language="mermaid"><code>`, so the selector never matched. Re-implemented as a ProseMirror decoration (`mermaidDiagramPlugin.ts`, mirroring the existing `codeHighlightPlugin` approach) instead of directly replacing the `<pre>` DOM, which was also unsafe (ProseMirror's mutation observer would revert/corrupt it). The Mermaid source now stays visible and editable, with the rendered diagram appearing right below it.
- Fix: Typing `- [ ] task` (or `*`/`+`/`1.` variants) character-by-character in Preview often failed to turn into a real checkbox, leaving the literal `[ ] ` text behind. The focus-expansion feature was eagerly inserting a literal `- ` prefix into the freshly-created (still-empty) list item before the closing `] ` could ever reach GFM's task-list input rule (which requires clean, unprefixed text). It now holds off expanding while the paragraph still looks like an in-progress checkbox marker. Also fixed a related case where, right after conversion, the checkbox's Web Component remount could steal the cursor into a nearby block (e.g. a preceding heading) mid-keystroke, corrupting further typing — a short-lived selection guard now catches and restores it.
- Fix: Pressing Enter right after confirming Japanese IME text on a checkbox item could turn the *next* line into a plain paragraph instead of continuing the checkbox. The IME-confirm Enter was also being processed as a real newline (ProseMirror's own fix for this is Safari-only and doesn't cover the Chromium/Electron Webview VS Code uses), silently splitting an extra empty list item; the user's next Enter then landed inside that empty item, triggering the standard "Enter on an empty list item exits the list" behavior. Now a duplicate Enter arriving within 50ms of `compositionend` (measured via the browser's own `event.timeStamp`, not wall-clock time, so it isn't thrown off by test/IPC latency) is ignored exactly once. An earlier version of this fix used a flat 500ms window and would also swallow a genuinely new Enter typed shortly after confirming IME text with something other than Enter (space/click/auto-commit) — narrowed to timestamp-based detection of the specific duplicate-event pattern to fix that.
- Fix: Creating a new heading, bullet, or blockquote in Preview and then moving on without any further edit could silently drop that block from the saved file. The focus-expansion feature's collapse step deliberately marks its transaction `addToHistory: false` (to avoid polluting Undo), but Milkdown's own markdown-sync listener (`@milkdown/plugin-listener`) completely ignores any transaction with that flag — so the collapsed block's final text never reached the host unless some *other* edit happened to trigger a resync afterward. Preview now explicitly re-serializes and re-sends the document right after every collapse, instead of relying on Milkdown's listener to notice.
- Fix: Typing a new heading (`## `) or blockquote (`> `) character-by-character could lose the space between the marker and the text (e.g. `##heading`, `>quote`). The focus-expansion feature inserts the marker programmatically, using a plain space, right before the block is otherwise empty — browsers can visually collapse that trailing space, and the next real keystroke then gets diffed against the collapsed (spaceless) DOM. Bullet/numbered/checkbox items were unaffected (they render through a Web Component that doesn't hit this collapse). The inserted separator is now a non-breaking space, matching what a real keystroke produces there.
- Test: Added a real-VS-Code (`@vscode/test-electron`) suite (`test/extension/raw.test.ts`, section 11) covering scenarios the browser-only webview harness can't reach — a real on-disk file edited directly (simulating an external tool/LLM), Undo after a blank-line-spanning renumber, and Shift+Tab at the leftmost indent level. One test is currently skipped pending manual verification in a real desktop VS Code window: whether an external file change is reflected while the file is open in Raw mode (see `docs/specifications/bug-hunt-2026-07-findings.md` for details) — Preview mode is unaffected either way since it reads the file directly rather than relying on VS Code's document auto-reload.

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
