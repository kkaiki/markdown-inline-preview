[日本語](./keyboard-shortcuts.ja.md)

# Keyboard Shortcuts

Last updated: 2026-08-08 (Notion-style key bindings implemented)

The same key bindings as **Notion** are built in and active by default—no need to edit `keybindings.json`.

- Key list and design decisions: [../specifications/notion-shortcuts.md](../specifications/notion-shortcuts.md)
- How collisions with VS Code defaults are resolved: [../research/notion-shortcuts.md](../research/notion-shortcuts.md)

**Mac uses `⌘`, Windows / Linux use `Ctrl`.**

> **You don't need to memorize this table.** In Live mode, hovering over a toolbar button
> (H1, B, etc.) shows its name and the corresponding shortcut key in a tooltip.
> Keys switch to match your OS.

***

## Inline formatting

Select text, then press. **Press the same key again to remove the formatting.** Press without
selecting to insert the markers and place your cursor inside.

| Action | Mac | Windows/Linux | Markdown |
|---|---|---|---|
| Bold | `⌘B` | `Ctrl+B` | `**text**` |
| Italic | `⌘I` | `Ctrl+I` | `*text*` |
| Underline | `⌘U` | `Ctrl+U` | `<u>text</u>` |
| Strikethrough | `⌘⇧S` | `Ctrl+Shift+S` | `~~text~~` |
| Inline code | `⌘E` | `Ctrl+E` | `` `text` `` |
| Link | `⌘K` | `Ctrl+K` | `[text]()`  (cursor goes to URL) |
| Highlight | `⌘⇧H` | `Ctrl+Shift+H` | `==text==` |
| Comment | `⌘⇧M` | `Ctrl+Shift+M` | `<!-- text -->` |
| Line break in block | `⇧Enter` | `Shift+Enter` | Line break only (doesn't continue list) |

`<u>`, `<!-- -->`, and `==` are not part of CommonMark, but we use them to match Notion's keys.
They're represented as HTML and extended syntax (Obsidian-compatible for `==`).

## Block conversion

| Action | Mac | Windows/Linux |
|---|---|---|
| Convert to plain text | `⌥⌘0` | `Ctrl+Shift+0` or `Alt+Ctrl+0` |
| Heading 1 / 2 / 3 | `⌥⌘1` `⌥⌘2` `⌥⌘3` | `Ctrl+Shift+1–3` or `Alt+Ctrl+1–3` |
| Checkbox | `⌥⌘4` | `Ctrl+Shift+4` or `Alt+Ctrl+4` |
| Bullet list | `⌥⌘5` | `Ctrl+Shift+5` or `Alt+Ctrl+5` |
| Numbered list | `⌥⌘6` | `Ctrl+Shift+6` or `Alt+Ctrl+6` |
| Toggle list (`<details>`) | `⌥⌘7` | `Ctrl+Shift+7` or `Alt+Ctrl+7` |
| Code block | `⌥⌘8` | `Ctrl+Shift+8` or `Alt+Ctrl+8` |
| Quote | `⌥⌘9` | `Ctrl+Shift+9` or `Alt+Ctrl+9` |

Windows supports both Notion's `Ctrl+Shift+Number` and the traditional `Alt+Ctrl+Number`.

> In Notion, `⌥⌘9` is "paginate." Since a single `.md` can't express that, we assign it to
> quote (`> `), which has no number shortcut in Notion.

## Block operations

| Action | Mac | Windows/Linux | Description |
|---|---|---|---|
| Toggle checkbox | `⌘Enter` | `Ctrl+Enter` | Converts a bullet to a checkbox if not already one |
| Duplicate block | `⌘D` | `Ctrl+D` | Also duplicates indented child lines |
| Move block up / down | `⌘⇧↑` / `⌘⇧↓` | `Ctrl+Shift+↑` / `↓` | Also moves child lines |

## Editing & navigation

| Action | Mac | Windows/Linux | Raw | Live |
|---|---|---|:---:|:---:|
| Smart Enter (continue list / exit) | `Enter` | `Enter` | ✅ | ✅ |
| Add / remove indent | `Tab` / `⇧Tab` | same | ✅ | ✅ |
| Progressive select all | `⌘A` | `Ctrl+A` | ✅ | ✅ |
| Move to line start (smart) | `⌘←` | `Home` | ✅ | `Home` only |
| Move to line end (smart) | `⌘→` | `End` | ✅ | ❌ |
| Select to line start | `⇧⌘←` | `Shift+Home` | ✅ | ❌ |
| Move up / down (table: same column) | `↑` / `↓` | same | ✅ | ❌ |
| Line break inside a table cell | `⇧Enter` | `Shift+Enter` | ❌ | ✅ |
| Select table cells | `⇧←↑↓→` | `Shift+←↑↓→` | ❌ | ✅ |
| Select table cells to the row / column edge | `⇧⌘←↑↓→` | `Ctrl+Shift+←↑↓→` | ❌ | ✅ |
| Find & replace | `⌘F` | `Ctrl+F` | VS Code default | ✅ |
| Jump to next / previous match | `⌘G` / `⇧⌘G` | `Ctrl+G` / `Ctrl+Shift+G` | VS Code default | ✅ |
| Toggle Live / Raw | `⌘⇧.` | `Ctrl+Shift+.` | ✅ | ✅ |

> **Mac note:** Live's smart line-start move only binds to `Home`. On Mac keyboards without a
> Home key, `fn+←` is the equivalent.

## Commands without keyboard bindings

Run from the command palette (`⌘⇧P` → search for "Markdown Inline Preview:").

| Command | Action |
|---|---|
| `Format Markdown Table` | Format table column widths |
| `Renumber Ordered Lists` | Renumber ordered lists |
| `Navigate to Next / Previous Table Cell` | Jump between cells |
| `Toggle Line Numbers` | Show / hide the line-number gutter |
| `Export to PDF` | Export to PDF |
| `Repair Double-Fenced Code Blocks` | Fix nested fences |

***

## Context-specific behavior

### Enter key (both modes)

| Context | Behavior |
|---|---|
| Numbered list | Continue with the next number |
| Checkbox | Add a new (unchecked) checkbox |
| Bullet list or quote | Continue the marker |
| Empty marker line | Remove the marker |
| Unclosed fence line (Live) | Add body content and closing fence |

`⇧Enter` never continues a marker—it inserts a line break only. In a table cell (Live), `Enter` does nothing and `⇧Enter` inserts `<br>`; the cell shows it as a line break once you leave the cell.

### `⌘←` (Mac) / `Home` (Windows)

| Context | Behavior |
|---|---|
| Plain text | Move to line start |
| List | Move after the marker |
| Heading | Move after the `#` |
| Table cell | Move to the start of cell content |
| Quote | Move after the `>` |

### `⌘A` (progressive select all)

Each press expands the selection.

| Current location | 1st press → 2nd press → 3rd press |
|---|---|
| Inside code fence | Content → entire block → entire document |
| Inside table | Cell/row → entire table → entire document |
| Elsewhere | Line → entire document |

***

## Disabling Notion key bindings

Set `markdownInline.notionKeymap.enabled` to `false` to fall back to **Raw mode only** to VS Code
defaults (`⌘B` = toggle sidebar, `⌘D` = select next match, etc.).

```json
// settings.json
{
  "markdownInline.notionKeymap.enabled": false
}
```

**Live mode keys live inside the WebView (CodeMirror), so even if you disable this setting, Live
mode keeps its bindings** (only the negative keybindings that override VS Code defaults are removed).

## Remapping individual keys (Raw mode only)

Use VS Code's keyboard shortcuts settings (`⌘K ⌘S`).

```json
// keybindings.json — example: restore ⌘B to VS Code default, move bold to ⌥⌘B
[
  { "key": "cmd+b", "command": "-markdownInline.formatBold" },
  {
    "key": "alt+cmd+b",
    "command": "markdownInline.formatBold",
    "when": "editorTextFocus && editorLangId == markdown"
  }
]
```

Live mode keys cannot be remapped this way.
