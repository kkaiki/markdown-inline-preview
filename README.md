# Markdown Inline Preview

A VSCode extension that provides a Notion-like or Obsidian-like WYSIWYG editing experience for Markdown files.

## Features

### List Type Conversion
Convert between different list types with a single keystroke:
- `Cmd+Shift+5` / `Ctrl+Shift+5`: Convert to bullet list (`- item`)
- `Cmd+Shift+6` / `Ctrl+Shift+6`: Convert to numbered list (`1. item`)
- `Cmd+Shift+4` / `Ctrl+Shift+4`: Convert to checkbox (`- [ ] task`)
- `Cmd+Shift+0` / `Ctrl+Shift+0`: Convert to plain text

Preserves indentation and supports multi-line selection.

### Auto-Numbered Lists
- Automatically renumbers ordered lists when you change indentation
- Press `Tab` or `Shift+Tab` to adjust indent and auto-renumber
- Use "Renumber Ordered Lists" command for manual renumbering

### Interactive Checkboxes
- **Smart Enter**: Automatically continues checkbox lists when pressing Enter
- **Click to toggle**: Click on checkboxes to toggle their state
- **Keyboard shortcut**: `Cmd+Enter` / `Ctrl+Enter` to toggle checkbox at cursor
- **Visual feedback**: Completed items (`[x]`) show strikethrough styling
- **Indent support**: Use `Tab` and `Shift+Tab` to adjust checkbox indentation

### Table Formatting
- **Auto-format**: Real-time column width adjustment while editing
- **Japanese support**: Accurate width calculation for CJK characters
- **CSV conversion**: Paste CSV data and press Enter to convert to Markdown table
- **Smart navigation**:
  - `Cmd+Left/Right`: Navigate within and between table cells
  - `Tab/Shift+Tab`: Move to next/previous cell

### Rich Heading Display
- Hides `#` symbols on non-focused lines for cleaner display
- Different colors and sizes for H1-H6 levels
- Shows raw Markdown syntax when editing

### Smart Decorations
- **Focus-aware**: Shows raw Markdown on focused line, preview styling on others
- **Inline styling**: `**bold**` and `*italic*` rendered inline
- **Horizontal rules**: `---`, `***`, `___` displayed as styled dividers

### Table of Contents Generation
- Write `/toc` or `/目次` to insert auto-generated table of contents
- Auto-updates when headings change
- Configurable heading level range
- `Cmd+Shift+T` / `Ctrl+Shift+T`: Manual update

### Smart Editing
- **Smart selection** (`Shift+Cmd+Left`): Progressive selection in lists and tables
- **Context-aware select all** (`Cmd+A`):
  - In table cells: Select cell content → row → document
  - In code blocks: Select code → document
- **Disabled auto-complete**: No unwanted suggestions while writing Markdown

## Keyboard Shortcuts

### List Operations
| Function | Mac | Windows/Linux |
|----------|-----|---------------|
| Continue list (Enter) | `Enter` | `Enter` |
| Increase indent | `Tab` | `Tab` |
| Decrease indent | `Shift+Tab` | `Shift+Tab` |

### List Conversion
| Function | Mac | Windows/Linux |
|----------|-----|---------------|
| Bullet list | `Cmd+Shift+5` | `Ctrl+Shift+5` |
| Numbered list | `Cmd+Shift+6` | `Ctrl+Shift+6` |
| Checkbox | `Cmd+Shift+4` | `Ctrl+Shift+4` |
| Plain text | `Cmd+Shift+0` | `Ctrl+Shift+0` |

### Checkbox Operations
| Function | Mac | Windows/Linux |
|----------|-----|---------------|
| Toggle checkbox | `Cmd+Enter` | `Ctrl+Enter` |

### Cursor & Selection
| Function | Mac | Windows/Linux |
|----------|-----|---------------|
| Smart move left | `Cmd+Left` | `Home` |
| Smart move right | `Cmd+Right` | `End` |
| Smart select left | `Shift+Cmd+Left` | `Shift+Home` |
| Update TOC | `Cmd+Shift+T` | `Ctrl+Shift+T` |

### Table Navigation
| Function | Mac | Windows/Linux |
|----------|-----|---------------|
| Next cell | `Tab` | `Tab` |
| Previous cell | `Shift+Tab` | `Shift+Tab` |
| Cell start/end | `Cmd+Left/Right` | `Home/End` |

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `markdownInline.enablePreview` | `true` | Enable preview decorations |
| `markdownInline.checkboxStyle` | `icons` | Checkbox display style |
| `markdownInline.table.widthCalculation` | `smart` | Table width calculation method |
| `markdownInline.table.japaneseCharWidth` | `2.0` | Width multiplier for Japanese characters |
| `markdownInline.toc.autoUpdate` | `true` | Auto-update table of contents |
| `markdownInline.toc.minLevel` | `1` | Minimum heading level for TOC |
| `markdownInline.toc.maxLevel` | `6` | Maximum heading level for TOC |

## Requirements

- VSCode 1.74.0 or higher

## Known Issues

- Complete WYSIWYG display is not possible due to VSCode Decorator API limitations
- Large files (10,000+ lines) may experience decoration update delays
- Some special Markdown syntax is not supported

### Conflicts with Other Extensions

If **Markdown All in One** overrides the Enter key, you may need to disable its keybinding:

1. Open keyboard shortcuts (`Cmd+K Cmd+S` / `Ctrl+K Ctrl+S`)
2. Search for `markdown.extension.onEnterKey`
3. Right-click and select "Remove Keybinding"
4. Reload VSCode

Or add this to your `keybindings.json`:
```json
{
  "key": "enter",
  "command": "-markdown.extension.onEnterKey",
  "when": "editorTextFocus && editorLangId == markdown"
}
```

## License

MIT

## Contributing

Bug reports and feature requests are welcome on the [GitHub repository](https://github.com/your-repo/markdown-inline-preview/issues).

## Changelog

### v1.4.0
- Added table cell navigation (Cmd+Left/Right, Tab/Shift+Tab)
- Added table of contents generation (/toc, /目次)
- Improved smart cursor movement in tables

### v1.2.1
- Added automatic checkbox continuation
- Improved Japanese character support in tables
- Added CSV to table conversion
- Performance improvements

### v1.0.0
- Initial release
- Obsidian-like editing features
