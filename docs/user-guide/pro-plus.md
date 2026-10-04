[日本語](./pro-plus.ja.md)

# PRO+ (one-time purchase)

A one-time purchase of **¥150 / $1** unlocks these five features.
It's not a subscription. There's no machine limit.

| Feature | Command / Setting |
|---|---|
| Remove PDF credit line | Automatically omitted from PDFs after purchase |
| PDF layout options | Setting `markdownInline.export.pdf.*` (see below) |
| Word (.docx) export | `Markdown Inline Preview: Export to Word (.docx)` |
| Batch export | Right-click in Explorer, or `Markdown Inline Preview: Batch Export to PDF…` |
| Marp slide export | `Markdown Inline Preview: Export as Slides (Marp PDF)` |

The editor itself and basic PDF export remain free and unlimited.
Running a PRO+ feature without a license shows a purchase prompt (no export happens).

**Everything runs on your PC.** PDFs are rendered using Chrome / Edge / Chromium installed on
your machine; Word files are created by the extension. No documents are uploaded anywhere, and
it works offline.

## PDF layout options

Controlled by settings (`markdownInline.export.pdf.*`). If you leave everything at default,
your PDFs look the same as before.

| Setting | Default | Description |
|---|---|---|
| `paperSize` | `default` | Paper size: `A4` / `Letter` / `Legal` / `A5` / `B5` |
| `margins` | `default` | Margins: `narrow` / `normal` / `wide` |
| `pageNumbers` | `false` | Page numbers (format: "n / total") |
| `headerText` / `footerText` | (empty) | Header / footer text. Supports `{title}` (file name) and `{date}` (export date) |
| `tableOfContents` | `false` | Table of contents at the start (headings 1–3) |
| `theme` | `default` | `serif` (serif font, loose line spacing) / `compact` (smaller font, tight spacing) |

Page numbers, headers, and footers require Chrome / Edge 131 or later.

## Word (.docx) export

Exports your open Markdown to `<filename>.docx` in the same directory.

- Headings become Word's "Heading 1–6" styles, so you can use the Navigator pane and
  auto-generated tables of contents
- Supports bold, italic, strikethrough, code, links, nested lists, checklists, tables, quotes,
  code blocks, and local images
- Internet images are not downloaded. Equations and Mermaid diagrams are pasted as text
- If a `.docx` with the same name exists, you're prompted before overwriting

## Batch export

Right-click a folder or multiple `.md` files in Explorer → **Batch Export to PDF…**.

- **Export each file as a separate PDF** — choose save location (next to each file, or a
  designated folder preserving folder structure). If a PDF with the same name exists, choose
  overwrite / skip / save as
- **Combine into one PDF** — table of contents at the start, page break between files, and
  bookmarks. Choose which files to include and their order. Links between `.md` files become
  clickable links in the PDF
- Files are sorted naturally (`2-intro.md` comes before `10-intro.md`)
- Open unsaved files are exported with their current on-screen content
- You can cancel mid-export; already-exported PDFs are kept. Errors are logged to the
  "Markdown Inline Preview: Export" output panel

## Marp slide export

Exports your open Markdown to `<filename>.slides.pdf` (one page per slide, 16:9 aspect).

- If the front-matter contains `marp: true`, your document follows Marp syntax
  (slides separated by `---`, themes like default / gaia / uncover, `size: 4:3`, etc.)
- Otherwise, plain notes become one slide per `#` / `##` heading
- No external fetches (equation fonts are bundled; emoji use your OS font). Raw HTML is not rendered

## Purchase & restore

| Command | Action |
|---|---|
| `Get PRO+ (one-time purchase)` | Opens your browser: sign in with Google, then pay (also available from the "PRO+" link in the status bar). Checkout uses your Google email, so you can restore the purchase later with the same account |
| `Enter License Key` | Paste your license key (shown at purchase) |
| `Restore Purchase (sign in with Google)` | Restore your purchase on another PC or after reinstalling |

- Your license is stored locally and never contacts the network to verify. It auto-updates
  in the background every 30 days, but if the update fails, your features keep working
- Because PRO+ is a digital product, purchases are not refundable. Please try the free PDF export
  before you buy. The extension itself stays free either way
- PRO+ is the right to use the features offered today. Features may change, and PRO+ may be
  discontinued; if so, we will try to give notice on the website or in the extension beforehand
