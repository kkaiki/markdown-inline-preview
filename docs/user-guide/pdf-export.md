[日本語](./pdf-export.ja.md)

# PDF Export

You can export your open Markdown file to PDF from the command palette
(**`Markdown Inline Preview: Export to PDF`**) or the **PDF** button in the Live mode toolbar.

## How it works

The export launches **Chrome / Edge / Chromium installed on your PC** in headless mode.

- **Your document is never sent anywhere.** It works offline.
- The PDF is saved in the same directory as the `.md` file with the same name but `.pdf` extension.
- If the browser is not found, set the path to the executable in
  `markdownInline.export.browserPath`.
- Equations (`$…$` / `$$…$$`), Mermaid diagrams, callouts (`> [!NOTE]`), highlights (`==…==`),
  and syntax-colored code blocks render the same way as in the editor.
- Positioning of the credit line on each page requires Chrome / Edge 131 or later.

## About the credit line

PDF export is **free and unlimited**—no page limit, nothing is omitted.

Free exports include a small credit line at the bottom of each page:

```
                     Made with Markdown Inline Preview
```

This can be removed with **PRO+** (a one-time purchase: **¥150 / $1**). After purchase,
you can export without the credit line on any number of machines. PRO+ also includes PDF layout
options (paper size, margins, page numbers, etc.), Word export, batch export, and Marp slide
export. See [pro-plus.md](./pro-plus.md) for details.

| Command | Action |
|---|---|
| `Get PRO+ (one-time purchase)` / `Remove PDF Credit Line (one-time purchase)` | Opens your browser to the purchase page |
| `Enter License Key` | Paste your license key (shown at purchase) |
| `Restore Purchase (sign in with Google)` | Restore your purchase on another PC or after reinstalling |

### Settings

| Setting | Default | Description |
|---|---|---|
| `markdownInline.export.creditLine` | `auto` | Set to `always` to keep the credit line even after purchase |
| `markdownInline.license.serverUrl` | (empty) | Advanced: override the license server URL |

### FAQ

**Do I need to buy to export PDFs?**
No. PDF export is free and unlimited—no page limits, nothing omitted.
The paid features (PRO+) are only: removing the credit line, PDF layout options, Word export,
batch export, and Marp slide export.

**Can I use my purchase on other PCs?**
Yes. There is no machine limit. You can enter your license key or sign in with the same Google
account you used at purchase to restore it.

**Does my license stay valid offline?**
Yes. Your license is stored locally and does not require the network to verify.
It auto-updates in the background every 30 days, but even if the update fails, export keeps working.

**Can I get a refund?**
Yes, full refund with no questions asked. Contact the support link on the purchase page.
After a refund, the credit line appears again and PRO+ features stop working, but **the
extension itself stays free and usable**.
