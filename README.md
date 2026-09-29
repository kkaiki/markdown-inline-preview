# Markdown Inline Preview

**Notion- and Obsidian-like Markdown editing for VS Code / Cursor.**

Markdown Inline Preview (`ipreview`) edits the same `.md` file in two modes:

| | **Raw** | **Live** |
|---|---------|----------|
| Also called | Inline / source mode | Live preview (Obsidian-style) |
| Engine | VS Code `TextEditor` + decorations | CodeMirror 6 WebView |
| What you see | Markdown source (`##`, `**`, `\|`) | **Syntax reveals only where the cursor is**; the rest renders |
| Best for | Precise syntax edits, Git diff, bulk replace | Reading and drafting |

Both modes edit **the raw Markdown itself**. Live mode never converts Markdown into a
different document model, so revealing and collapsing syntax never moves your file's bytes.

Switch from the tab's context menu or the command palette:
**`Markdown Inline Preview: Live / Raw を切り替え`**.

**日本語:** [README.ja.md](./README.ja.md)

---

## Installation

```bash
# From a packaged VSIX (after npm run package)
code --install-extension markdown-inline-preview-3.3.0.vsix

# Or build from source
git clone https://github.com/kkaiki/markdown-inline-preview.git
cd markdown-inline-preview
npm install
npm run package
code --install-extension markdown-inline-preview-*.vsix
```

For development, open the folder in VS Code and press **F5**.

---

## Raw mode (Inline Preview)

Raw mode keeps full Markdown syntax visible and adds editing helpers on top.

### Lists & checkboxes

- **Smart Enter** — continue lists; exit on an empty item
- **Convert list type** — `Alt+Cmd+4/5/6/0` (Mac) / `Alt+Ctrl+4/5/6/0` (Win/Linux)
- **Toggle checkbox** — click or `Cmd+Enter` / `Ctrl+Enter`
- **Indent** — `Tab` / `Shift+Tab`
- **Auto-renumber** ordered lists on indent change
- **Strikethrough** on completed tasks; optional CodeLens

### Tables

- **Format** column widths (CJK-aware width calculation)
- **Cell navigation** — `Cmd+←/→`, arrow keys
- **Smart select all** — line → document; in tables cell → row → table → document (`Cmd+A`)
- **Inline wrap preview** — `↳` hint at line end + hover popup

### Headings, code & decorations

- **Heading colors** — H1–H6 schemes (`default` / `monochrome` / `vibrant`)
- **Code block** background + simple syntax coloring
- **Horizontal rules** styled as dividers
- **Image thumbnails** on non-editing lines + hover preview (off by default)

### Slash commands & smart editing

- **Slash menu** at line start: `/table`, `/h1`–`/h6`, `/code`, `/quote`, `/callout`,
  `/divider`, `/bullet`, `/numbered`, `/todo`
- **Smart cursor** in lists and tables (`Cmd+←/→`, arrows)
- **Progressive selection** (`Shift+Cmd+←`)
- **Fenced code auto-close** when typing ` ``` `

---

## Live mode (Obsidian-style live editing)

Live opens the file in a CodeMirror 6 custom editor. You edit raw Markdown directly,
and **only the syntax under the cursor** expands into source form.

### Editing & rendering

- **CommonMark + GFM** — headings, tables, task lists, strikethrough, links
- **Reveal / collapse syntax** by token, line, or block, depending on the element
- **Edit inside tables** while they stay rendered
- **Row / column operations** — right-click a cell to select, insert, or delete rows and
  columns, or delete the whole table
- **Paste from Excel / Google Sheets / Numbers** — a copied cell range becomes a Markdown table
  (first row as header). Works in Raw mode too; code copied from an editor is pasted as-is
- **Code fences** rendered as blocks with a language label; put the cursor on the fence to edit it
- **Slash menu** — same commands as Raw (`live.enableSlashMenu`)
- **Checkboxes** — click to toggle; saved as `- [x]` in the file

### Rich content

- **KaTeX** — `$...$` and `$$...$$`
- **Mermaid** — ` ```mermaid ` block previews
- **Images** — workspace-relative `![alt](./path)` rendered inline
- **Frontmatter** — YAML block rendering
- **Block widgets** — callouts, horizontal rules

### UI & navigation

- **Toolbar** — H1/H2/H3, checkbox, bullet, numbered, quote, bold, italic, code, PDF, Raw
- **Find & replace** (`⌘F` / `Ctrl+F`) — searches the raw Markdown source, including syntax
  hidden by the preview (`**`, `#`, …); case / whole-word / regex toggles
- **Line-number gutter** (`live.showLineNumbers`)
- **Git diff gutter** against HEAD — added = green / changed = blue / deleted = red triangle
  (`live.showDiffGutter`)
- **Mode memory** per file — reopening a file uses the mode you last used for it
  (`live.rememberMode`)
- **PDF export** — `Markdown Inline Preview: Export to PDF`. Free and unlimited; a small
  credit line is printed at the bottom of each page — see
  [docs/user-guide/pdf-export.md](./docs/user-guide/pdf-export.md) ([日本語](./docs/user-guide/pdf-export.ja.md))

### PRO+ (one-time purchase)

A single one-time purchase — **¥100 / $1 / €1**, no subscription, any number of machines.
Everything above stays free. PRO+ adds:

- **No credit line** on exported PDFs
- **PDF layout options** — paper size, margins, page numbers, header / footer, table of contents, themes
- **Word (.docx) export** — Word heading styles, tables, lists and local images
- **Batch export** — a folder or several files at once: one PDF per file, or one combined PDF
  with a table of contents
- **Marp slide export** — slides as a PDF (Marp syntax, or one slide per heading)

Everything runs on your machine; documents are never uploaded. Details:
[docs/user-guide/pro-plus.md](./docs/user-guide/pro-plus.md) ([日本語](./docs/user-guide/pro-plus.ja.md))

---

## Keyboard shortcuts

**Notion's key assignments, adopted as-is** — the same keys work in both modes.

| Action | Mac | Windows/Linux |
|--------|-----|---------------|
| Bold / italic / underline | `Cmd+B` / `Cmd+I` / `Cmd+U` | `Ctrl+B` / `Ctrl+I` / `Ctrl+U` |
| Inline code / strikethrough | `Cmd+E` / `Cmd+Shift+S` | `Ctrl+E` / `Ctrl+Shift+S` |
| Link / highlight / comment | `Cmd+K` / `Cmd+Shift+H` / `Cmd+Shift+M` | `Ctrl+K` / `Ctrl+Shift+H` / `Ctrl+Shift+M` |
| Block conversion (text/heading/to-do/bullet/numbered/toggle/code/quote) | `Alt+Cmd+0–9` | `Ctrl+Shift+0–9` (or `Alt+Ctrl+0–9`) |
| Toggle checkbox | `Cmd+Enter` | `Ctrl+Enter` |
| Duplicate block | `Cmd+D` | `Ctrl+D` |
| Move block up / down | `Cmd+Shift+↑/↓` | `Ctrl+Shift+↑/↓` |
| Line break inside a block | `Shift+Enter` | `Shift+Enter` |
| List indent | `Tab` / `Shift+Tab` | same |
| Smart select all | `Cmd+A` | `Ctrl+A` |
| Toggle Live / Raw | `Cmd+Shift+.` | `Ctrl+Shift+.` |

Set `markdownInline.notionKeymap.enabled` to `false` to fall back to VS Code defaults
(`Cmd+B` = sidebar, etc.) in Raw mode.

More: [docs/user-guide/keyboard-shortcuts.md](./docs/user-guide/keyboard-shortcuts.md) ([日本語](./docs/user-guide/keyboard-shortcuts.ja.md))

---

## Configuration

### Raw (highlights)

| Setting | Default | Description |
|---------|---------|-------------|
| `markdownInline.enablePreview` | `true` | Master switch for Raw decorations |
| `markdownInline.headingColorScheme` | `default` | Heading color scheme |
| `markdownInline.imagePreview.showThumbnail` | `false` | Inline image thumbnails |
| `markdownInline.table.inlineWrap.enabled` | `true` | Wrapped table preview |
| `markdownInline.advanced.autoFormatTables` | `false` | Format tables when leaving a table line |
| `markdownInline.autoMoveCompletedTasks` | `false` | Move completed tasks to the bottom |

### Live (highlights)

| Setting | Default | Description |
|---------|---------|-------------|
| `markdownInline.live.defaultMode` | `live` | Mode used when opening Markdown (`raw` / `live`) |
| `markdownInline.live.rememberMode` | `true` | Reopen each file in the mode you last used |
| `markdownInline.live.showToolbar` | `true` | Top toolbar |
| `markdownInline.live.showLineNumbers` | `true` | Line-number gutter |
| `markdownInline.live.showDiffGutter` | `true` | Git diff gutter |
| `markdownInline.live.enableSlashMenu` | `true` | `/` command menu |

`markdownInline.advanced.*` overrides legacy toggles when explicitly set. Manual commands
(format table, repair fences) still work when auto behavior is off.

---

## Requirements

- VS Code / Cursor **1.74.0+**

## Known issues

- Raw decorations cannot change font size (VS Code Decoration API limit); headings use color and background instead.
- Very large files (10k+ lines) may slow decoration updates.
- Live targets CommonMark/GFM; wiki links and some Obsidian extensions are not supported.
- Live-mode keys live inside the WebView (CodeMirror), so they cannot be remapped from
  VS Code's keyboard-shortcuts UI. Raw-mode keys can.
- Integration tests (`npm test`) need the VS Code Electron runner; prefer `npm run test:unit` in CI.

### Conflicts with other extensions

If **Markdown All in One** overrides Enter, remove its `markdown.extension.onEnterKey` binding or add to `keybindings.json`:

```json
{
  "key": "enter",
  "command": "-markdown.extension.onEnterKey",
  "when": "editorTextFocus && editorLangId == markdown"
}
```

---

## Documentation

| Doc | Content |
|-----|---------|
| [docs/user-guide/keyboard-shortcuts.md](./docs/user-guide/keyboard-shortcuts.md) | Keyboard shortcuts |
| [docs/user-guide/pdf-export.md](./docs/user-guide/pdf-export.md) | PDF export |
| [docs/user-guide/pro-plus.md](./docs/user-guide/pro-plus.md) | PRO+ (one-time purchase) |
| [CHANGELOG.md](./CHANGELOG.md) | Release notes |
| [docs/user-guide/keyboard-shortcuts.ja.md](./docs/user-guide/keyboard-shortcuts.ja.md) | キーボードショートカット（日本語） |
| [docs/user-guide/pdf-export.ja.md](./docs/user-guide/pdf-export.ja.md) | PDF 書き出し（日本語） |
| [docs/user-guide/pro-plus.ja.md](./docs/user-guide/pro-plus.ja.md) | PRO+（日本語） |

---

## Contributing

Issues and pull requests: [github.com/kkaiki/markdown-inline-preview](https://github.com/kkaiki/markdown-inline-preview/issues)

## License

MIT
