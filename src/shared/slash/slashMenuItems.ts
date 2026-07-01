/**
 * Raw / Preview 共通のスラッシュコマンド定義。
 * Raw は rawSnippet（SnippetString 用）、Preview は previewMarkdown（replaceRange 用）を使う。
 *
 * `detail` は **英語ソース**（i18n のキー）。表示時に訳す:
 * - Raw（VS Code 補完）: `vscode.l10n.t(item.detail)`（`slashCompletion.ts`）
 * - Preview（WebView）: `t(item.detail)`（`previewSlashMenu.ts`）
 * 訳は `l10n/bundle.l10n.ja.json`（ホスト）と `i18n.ts` の `JA` 辞書（WebView）に持つ。
 */
export interface SlashMenuItemDef {
    id: string;
    label: string;
    detail: string;
    filterText: string;
    sortOrder: string;
    rawSnippet: string;
    previewMarkdown: string;
}

export const SLASH_MENU_ITEMS: SlashMenuItemDef[] = [
    { id: 'h1', label: 'h1', detail: 'Heading 1', filterText: 'h1', sortOrder: '01', rawSnippet: '# $0', previewMarkdown: '# ' },
    { id: 'h2', label: 'h2', detail: 'Heading 2', filterText: 'h2', sortOrder: '02', rawSnippet: '## $0', previewMarkdown: '## ' },
    { id: 'h3', label: 'h3', detail: 'Heading 3', filterText: 'h3', sortOrder: '03', rawSnippet: '### $0', previewMarkdown: '### ' },
    { id: 'h4', label: 'h4', detail: 'Heading 4', filterText: 'h4', sortOrder: '04', rawSnippet: '#### $0', previewMarkdown: '#### ' },
    { id: 'h5', label: 'h5', detail: 'Heading 5', filterText: 'h5', sortOrder: '05', rawSnippet: '##### $0', previewMarkdown: '##### ' },
    { id: 'h6', label: 'h6', detail: 'Heading 6', filterText: 'h6', sortOrder: '06', rawSnippet: '###### $0', previewMarkdown: '###### ' },
    {
        id: 'table',
        label: 'table',
        detail: 'Insert table (2 columns)',
        filterText: 'table',
        sortOrder: '07',
        rawSnippet: '| $1 | $2 |\n| --- | --- |\n| $3 | $4 |',
        previewMarkdown: '|  |  |\n| --- | --- |\n|  |  |'
    },
    {
        id: 'code',
        label: 'code',
        detail: 'Code block',
        filterText: 'code',
        sortOrder: '08',
        rawSnippet: '```${1:bash}\n$0\n```',
        previewMarkdown: '```bash\n\n```'
    },
    { id: 'quote', label: 'quote', detail: 'Quote block', filterText: 'quote', sortOrder: '09', rawSnippet: '> $0', previewMarkdown: '> ' },
    { id: 'divider', label: 'divider', detail: 'Divider (---)', filterText: 'divider', sortOrder: '10', rawSnippet: '---', previewMarkdown: '---' },
    { id: 'callout', label: 'callout', detail: 'Callout 💡', filterText: 'callout', sortOrder: '11', rawSnippet: '> 💡 $0', previewMarkdown: '> 💡 ' },
    { id: 'callout-warning', label: 'callout warning', detail: 'Warning callout ⚠️', filterText: 'callout warning', sortOrder: '12', rawSnippet: '> ⚠️ $0', previewMarkdown: '> ⚠️ ' },
    { id: 'callout-danger', label: 'callout danger', detail: 'Danger callout 🚨', filterText: 'callout danger', sortOrder: '13', rawSnippet: '> 🚨 $0', previewMarkdown: '> 🚨 ' },
    { id: 'callout-info', label: 'callout info', detail: 'Info callout ℹ️', filterText: 'callout info', sortOrder: '14', rawSnippet: '> ℹ️ $0', previewMarkdown: '> ℹ️ ' },
    { id: 'bullet', label: 'bullet', detail: 'Bullet list', filterText: 'bullet', sortOrder: '15', rawSnippet: '- $0', previewMarkdown: '- ' },
    { id: 'numbered', label: 'numbered', detail: 'Numbered list', filterText: 'numbered', sortOrder: '16', rawSnippet: '1. $0', previewMarkdown: '1. ' },
    { id: 'todo', label: 'todo', detail: 'Checkbox', filterText: 'todo', sortOrder: '17', rawSnippet: '- [ ] $0', previewMarkdown: '- [ ] ' },
    { id: 'heading', label: 'heading', detail: 'Heading (choose level)', filterText: 'heading', sortOrder: '18', rawSnippet: '/heading ${1:2} $0', previewMarkdown: '## ' }
];

export function filterSlashMenuItems(query: string): SlashMenuItemDef[] {
    const q = query.trim().toLowerCase();
    if (!q) return [...SLASH_MENU_ITEMS];
    return SLASH_MENU_ITEMS.filter(
        (item) =>
            item.label.toLowerCase().startsWith(q) ||
            item.filterText.toLowerCase().includes(q) ||
            item.id.toLowerCase().startsWith(q)
    );
}
