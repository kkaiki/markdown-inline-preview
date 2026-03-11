# Current Status Audit

Last reviewed: 2026-03-11

## Source of truth

The current implementation should be read from these files first:

- `package.json`: public commands, keybindings, settings, activation
- `src/commands/*.ts`: registered command surface
- `src/extension-markdown-inline.ts`: decorations, TOC updates, code block handling, checkbox click behavior
- `test/extension.test.js` and `test/suite/*.test.js`: behavior that is actually exercised

Older docs contain a mix of current behavior, planned behavior, and stale examples.

## Major implemented feature areas

### 1. List editing

Implemented and visible in commands/tests:

- Smart Enter for numbered lists, bullets, and checkboxes
- List type conversion: bullet, numbered, checkbox, normal text
- Indent / outdent with renumbering
- Ordered list renumbering
- Checkbox toggle

Primary public commands:

- `markdownInline.smartEnter`
- `markdownInline.renumberLists`
- `markdownInline.convertToBullet`
- `markdownInline.convertToNumbered`
- `markdownInline.convertToCheckbox`
- `markdownInline.convertToNormal`
- `markdownInline.toggleCheckbox`
- `markdownInline.increaseIndent`
- `markdownInline.decreaseIndent`

### 2. Table editing and navigation

Implemented in code:

- Table formatting
- Width calculation with CJK-aware heuristics
- Smart left/right movement inside table cells
- Up/down movement that keeps the same cell index
- Table-aware select-all behavior
- Dedicated left/right table navigation handlers

Public commands:

- `markdownInline.formatTable`
- `markdownInline.tableNavigateRight`
- `markdownInline.tableNavigateLeft`
- `markdownInline.smartMoveLeft`
- `markdownInline.smartMoveRight`
- `markdownInline.smartMoveUp`
- `markdownInline.smartMoveDown`
- `markdownInline.smartSelectLeft`
- `markdownInline.smartSelectAll`

### 3. TOC support

Implemented in code:

- Detect `/toc` and `/目次`
- Manual TOC update command
- Automatic TOC update on heading changes
- Configurable min/max heading levels

Public command:

- `markdownInline.updateTableOfContents`

### 4. Visual decorations

Implemented in extension code:

- Checkbox decorations
- Heading decorations
- Horizontal rule decorations
- Code block line decoration
- Focus-aware markdown preview behavior

### 5. Miscellaneous editing helpers

Implemented as commands but not exposed by default keybindings:

- `markdownInline.moveLineUp`
- `markdownInline.moveLineDown`

## Current keybinding map

### Bound in `package.json`

- `Enter`: `markdownInline.smartEnter`
- `Cmd+Enter` / `Ctrl+Enter`: `markdownInline.toggleCheckbox`
- `Tab`: `markdownInline.increaseIndent`
- `Shift+Tab`: `markdownInline.decreaseIndent`
- `Cmd+Left` / `Home`: `markdownInline.smartMoveLeft`
- `Shift+Cmd+Left` / `Shift+Home`: `markdownInline.smartSelectLeft`
- `Cmd+Right` / `End`: `markdownInline.smartMoveRight`
- `Up`: `markdownInline.smartMoveUp`
- `Down`: `markdownInline.smartMoveDown`
- `Cmd+A` / `Ctrl+A`: `markdownInline.smartSelectAll`
- `Alt+Cmd+4/5/6/0` and `Alt+Ctrl+4/5/6/0`: list conversion commands
- `Cmd+Shift+T` / `Ctrl+Shift+T`: TOC update

### Commands without default keybindings

- `markdownInline.renumberLists`
- `markdownInline.formatTable`
- `markdownInline.tableNavigateRight`
- `markdownInline.tableNavigateLeft`
- `markdownInline.moveLineUp`
- `markdownInline.moveLineDown`

These are callable from the command palette, but not documented consistently.

## Command surface issues

### Declared in `package.json`, but not registered in current code

- `markdownInline.clickCheckbox`
- `markdownInline.toggleCheckboxAtLine`

`package.json` advertises these commands, but `src/commands/index.ts` does not register them through `registerCommands()`, and there is no direct `registerCommand()` call elsewhere in the current TypeScript source.

This means the public command list is ahead of the actual registered runtime surface.

## Documentation mismatches

### 1. Shortcut docs are outdated

Several user-facing docs still say list conversion uses:

- `Cmd+Shift+4/5/6/0`
- `Ctrl+Shift+4/5/6/0`

Actual `package.json` keybindings use:

- `Alt+Cmd+4/5/6/0`
- `Alt+Ctrl+4/5/6/0`

Affected docs:

- `README.md`
- `docs/user-guide/features.md`
- `docs/user-guide/keyboard-shortcuts.md`
- `docs/user-guide/getting-started.md`
- `docs/specifications/list-operations.md`

### 2. "Planned" vs "implemented" is inconsistent

Examples:

- `docs/user-guide/features.md` says table cell navigation is "planned"
- `docs/user-guide/keyboard-shortcuts.md` says table shortcuts are "planned"
- `docs/specifications/table-navigation.md` says phases are complete
- `package.json` and `src/commands/navigation.ts` show the navigation commands are already implemented

### 3. Labeled list support appears undocumented as implemented, but not backed by code

`docs/specifications/list-operations.md` claims labeled list support such as `Y:`, `W:`, `T:` is implemented.

Current code and tests do not show matching support:

- no matching command or parser path was found in `src/commands/*.ts` or `src/utils/*.ts`
- no test coverage was found for labeled list continuation

This spec currently overstates the feature set.

### 4. Getting-started version examples are stale

`docs/user-guide/getting-started.md` still uses `markdown-inline-preview-1.4.0.vsix`, while the package version is `1.4.9`.

### 5. README repository metadata is partially stale

`README.md` still links issues to a placeholder repository path:

- `https://github.com/your-repo/markdown-inline-preview/issues`

## Settings that exist but are not well surfaced

The following settings exist in `package.json`, but are either lightly documented or not consistently mentioned in user docs:

- `markdownInline.showCheckboxCodeLens`
- `markdownInline.autoMoveCompletedTasks`
- `markdownInline.hideStrikethroughOnEdit`
- `markdownInline.checkboxClickableArea`
- `markdownInline.enableHeadingDecorations`
- `markdownInline.headingColorScheme`
- `markdownInline.table.narrowCharWidth`
- `markdownInline.table.wideCharWidth`

Also note:

- `showCheckboxCodeLens` is present as a setting, but CodeLens provider wiring was not found in the current TypeScript command registration path

## Recommended cleanup order

### Phase 1: fix public truth

- Remove or implement `clickCheckbox` and `toggleCheckboxAtLine`
- Update all shortcut docs to match actual keybindings
- Mark table navigation as implemented everywhere
- Remove or reclassify labeled list support from the spec

### Phase 2: consolidate docs

- Make `README.md` a short product overview
- Make `docs/user-guide/keyboard-shortcuts.md` the canonical shortcut table
- Make `docs/specifications/*` implementation-facing, not marketing-facing
- Add one feature matrix with columns: feature, command, keybinding, status, tested

### Phase 3: fill product gaps

- Decide whether `renumberLists` and `formatTable` need default keybindings
- Decide whether `moveLineUp` / `moveLineDown` should be exposed or removed
- Decide whether checkbox CodeLens is real, planned, or dead config

