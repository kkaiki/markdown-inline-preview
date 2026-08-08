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
code --install-extension ipreview-3.1.1.vsix

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
- **Line-number gutter** (`live.showLineNumbers`)
- **Git diff gutter** against HEAD — added = green / changed = blue / deleted = red triangle
  (`live.showDiffGutter`)
- **Mode memory** per file — reopening a file uses the mode you last used for it
  (`live.rememberMode`)
- **PDF export** — `Markdown Inline Preview: Export to PDF`

---

## Keyboard shortcuts

| Action | Mac | Windows/Linux | Raw | Live |
|--------|-----|---------------|:---:|:---:|
| Toggle checkbox | `Cmd+Enter` | `Ctrl+Enter` | ✅ | — |
| List indent | `Tab` / `Shift+Tab` | same | ✅ | ✅ |
| Convert to bullet / numbered / checkbox / plain | `Alt+Cmd+5/6/4/0` | `Alt+Ctrl+5/6/4/0` | ✅ | ✅ |
| Convert to heading 1/2/3 | `Alt+Cmd+1/2/3` | `Alt+Ctrl+1/2/3` | ✅ | ✅ |
| Convert to code block / quote | `Alt+Cmd+8/9` | `Alt+Ctrl+8/9` | — | ✅ |
| Bold / italic | `Cmd+B` / `Cmd+I` | `Ctrl+B` / `Ctrl+I` | — | ✅ |
| Smart move in table/list | `Cmd+←/→` | `Home` / `End` | ✅ | ✅ (`Home`) |
| Smart select all | `Cmd+A` | `Ctrl+A` | ✅ | ✅ |

Switching modes currently has no default keybinding (use the command palette or the tab's
context menu).

More: [docs/user-guide/keyboard-shortcuts.md](./docs/user-guide/keyboard-shortcuts.md)

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
- Live-mode keys live inside the WebView, so they cannot be remapped from VS Code's
  keyboard-shortcuts UI (background and plan: [docs/research/notion-shortcuts.md](./docs/research/notion-shortcuts.md)).
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
| [docs/specifications/live-mode/README.md](./docs/specifications/live-mode/README.md) | Live mode specification (observed spec, requirements, architecture) |
| [docs/user-guide/keyboard-shortcuts.md](./docs/user-guide/keyboard-shortcuts.md) | Keyboard shortcuts |
| [docs/developer/architecture.md](./docs/developer/architecture.md) | Architecture overview |
| [CHANGELOG.md](./CHANGELOG.md) | Release notes |

---

## Contributing

Issues and pull requests: [github.com/kkaiki/markdown-inline-preview](https://github.com/kkaiki/markdown-inline-preview/issues)

See also [docs/developer/contributing.md](./docs/developer/contributing.md).

## License

MIT
