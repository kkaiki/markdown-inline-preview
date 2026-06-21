# Markdown Inline Preview

**Notion- and Obsidian-like Markdown editing for VS Code / Cursor.**

Markdown Inline Preview (`ipreview`) edits the same `.md` file in two modes:

| | **Raw** | **Preview** |
|---|---------|-------------|
| Also called | Inline / source mode | WYSIWYG mode |
| Engine | VS Code `TextEditor` + decorations | Milkdown WebView |
| What you see | Markdown source (`##`, `**`, `\|`) | Rendered output (editable) |
| Best for | Precise syntax edits, Git diff, bulk replace | Reading and drafting |

Switch with the title-bar button or **`Cmd+Shift+M`** / **`Ctrl+Shift+M`**.

**日本語:** [README.ja.md](./README.ja.md)

---

## Installation

```bash
# From a packaged VSIX (after npm run package)
code --install-extension ipreview-1.8.5.vsix

# Or build from source
git clone https://github.com/kkaiki/markdown-inline-preview.git
cd markdown-inline-preview
npm install
npm run package
code --install-extension ipreview-*.vsix
```

For development, open the folder in VS Code and press **F5**.

---

## Raw mode (Inline Preview)

Raw mode keeps full Markdown syntax visible and adds editing helpers on top.

### Lists & checkboxes

- **Smart Enter** — continue lists; exit on empty line
- **Convert list type** — `Alt+Cmd+4/5/6/0` (Mac) / `Alt+Ctrl+4/5/6/0` (Win/Linux)
- **Toggle checkbox** — click or `Cmd+Enter` / `Ctrl+Enter`
- **Indent** — `Tab` / `Shift+Tab`
- **Auto-renumber** ordered lists on indent change
- **Strikethrough** on completed tasks; optional CodeLens

### Tables

- **Auto-format** column widths (CJK-aware width calculation)
- **Cell navigation** — `Cmd+←/→`, `Tab`, arrow keys
- **Smart select all** — cell → row → table → document (`Cmd+A`)
- **Inline wrap preview** — `↳` hint at line end + hover popup

### Headings, code & decorations

- **Heading colors** — H1–H6 schemes (`default` / `monochrome` / `vibrant`)
- **Code block** background + simple syntax coloring
- **Horizontal rules** styled as dividers
- **Image thumbnails** (48px) on non-editing lines + hover preview

### TOC & slash commands

- **`/toc`** or **`/目次`** — insert / auto-update table of contents
- **Slash menu** at line start: `/table`, `/h1`–`/h6`, `/code`, `/quote`, `/callout`, `/bullet`, `/numbered`, `/todo`, etc.

### Smart editing

- **Smart cursor** in lists and tables (`Cmd+←/→`, arrows)
- **Progressive selection** (`Shift+Cmd+←`)
- **Fenced code auto-close** when typing ` ``` `

---

## Preview mode (WYSIWYG)

Preview opens the file in a Milkdown-based custom editor. Edits debounce to the file (~200ms); external Raw edits sync back (~100ms).

### Editing & rendering

- **CommonMark + GFM** — headings, tables, task lists, strikethrough, links
- **Direct WYSIWYG editing** — what you see is what gets saved as Markdown
- **Focus syntax** — Markdown markers (`##`, `**`, `[text](url)`) visible only on the **focused block** (Obsidian-style)
- **Heading Backspace** — at heading start, `# Title` → normal line `#Title`, then delete `#` character by character
- **Slash menu** — same commands as Raw (`preview.enableSlashMenu`)
- **Checkboxes** — click to toggle; saved as `- [x]` in the file

### Rich content

- **Syntax highlighting** — highlight.js (common languages)
- **KaTeX** — `$...$` and `$$...$$` (`preview.enableMath`)
- **Mermaid** — ` ```mermaid ` blocks (`preview.enableMermaid`)
- **Images** — workspace-relative `![alt](./path)` rendered inline
- **Frontmatter panel** — YAML summary above the body (`preview.showFrontmatter`)

### UI & navigation

- **Theme** follows VS Code or fixed light/dark (`preview.theme`)
- **Typography** — `preview.fontSize` (default **12**), `fontFamily`, `maxWidth`
- **Link clicks** — open workspace files or external URLs in the browser
- **Scroll sync** — heading anchor when switching back to Raw (`preview.syncScroll`)
- **Mode memory** shared across all Markdown files — switching one to Preview opens new files in Preview too (`preview.rememberMode`)

> The floating formatting toolbar was removed in v1.8.3. Use the **`/`** slash menu instead.

---

## Keyboard shortcuts

| Action | Mac | Windows/Linux |
|--------|-----|---------------|
| **Raw ↔ Preview** | `Cmd+Shift+M` | `Ctrl+Shift+M` |
| Toggle checkbox | `Cmd+Enter` | `Ctrl+Enter` |
| List indent | `Tab` / `Shift+Tab` | same |
| Convert to bullet / numbered / checkbox / plain | `Alt+Cmd+5/6/4/0` | `Alt+Ctrl+5/6/4/0` |
| Smart move in table/list | `Cmd+←/→` | `Home` / `End` |
| Smart select all | `Cmd+A` | `Ctrl+A` |

More: [docs/user-guide/keyboard-shortcuts.md](./docs/user-guide/keyboard-shortcuts.md)

---

## Configuration

### Raw (highlights)

| Setting | Default | Description |
|---------|---------|-------------|
| `markdownInline.enablePreview` | `true` | Master switch for Raw decorations |
| `markdownInline.headingColorScheme` | `default` | Heading color scheme |
| `markdownInline.imagePreview.showThumbnail` | `true` | Inline image thumbnails |
| `markdownInline.table.inlineWrap.enabled` | `true` | Table wrap preview |
| `markdownInline.advanced.autoFormatTables` | `false` | Auto-format when leaving a table row |
| `markdownInline.toc.autoUpdate` | `true` | Auto-update `/toc` blocks |

### Preview (highlights)

| Setting | Default | Description |
|---------|---------|-------------|
| `markdownInline.preview.defaultMode` | `raw` | `raw` or `preview` on first open |
| `markdownInline.preview.showFocusSyntax` | `true` | Show markers on focused block |
| `markdownInline.preview.enableSlashMenu` | `true` | `/` command menu |
| `markdownInline.preview.fontSize` | `12` | Body font size (px) |
| `markdownInline.preview.enableMath` | `true` | KaTeX |
| `markdownInline.preview.enableMermaid` | `true` | Mermaid diagrams |

`markdownInline.advanced.*` overrides legacy toggles when explicitly set. Manual commands (format table, update TOC) still work when auto behavior is off.

Full lists: [docs/specifications/inline-preview-features.md](./docs/specifications/inline-preview-features.md) · [docs/specifications/preview-features.md](./docs/specifications/preview-features.md)

---

## Requirements

- VS Code / Cursor **1.74.0+**

## Known issues

- Raw decorations cannot change font size (VS Code Decoration API limit); headings use color and background instead.
- Very large files (10k+ lines) may slow decoration updates.
- Preview targets CommonMark/GFM; wiki links and some Obsidian extensions are not supported.
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
| [docs/README.md](./docs/README.md) | Documentation index |
| [docs/specifications/inline-preview-features.md](./docs/specifications/inline-preview-features.md) | Raw mode specification |
| [docs/specifications/preview-features.md](./docs/specifications/preview-features.md) | Preview mode specification |
| [docs/user-guide/keyboard-shortcuts.md](./docs/user-guide/keyboard-shortcuts.md) | Keyboard shortcuts |
| [CHANGELOG.md](./CHANGELOG.md) | Release notes |

---

## Contributing

Issues and pull requests: [github.com/kkaiki/markdown-inline-preview](https://github.com/kkaiki/markdown-inline-preview/issues)

See [docs/developer/contributing.md](./docs/developer/contributing.md).

## License

MIT
