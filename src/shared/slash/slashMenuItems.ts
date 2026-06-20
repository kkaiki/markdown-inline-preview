/**
 * Raw / Preview 共通のスラッシュコマンド定義。
 * Raw は rawSnippet（SnippetString 用）、Preview は previewMarkdown（replaceRange 用）を使う。
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
    { id: 'h1', label: 'h1', detail: 'H1 大見出し', filterText: 'h1', sortOrder: '01', rawSnippet: '# $0', previewMarkdown: '# ' },
    { id: 'h2', label: 'h2', detail: 'H2 中見出し', filterText: 'h2', sortOrder: '02', rawSnippet: '## $0', previewMarkdown: '## ' },
    { id: 'h3', label: 'h3', detail: 'H3 小見出し', filterText: 'h3', sortOrder: '03', rawSnippet: '### $0', previewMarkdown: '### ' },
    { id: 'h4', label: 'h4', detail: 'H4 見出し', filterText: 'h4', sortOrder: '04', rawSnippet: '#### $0', previewMarkdown: '#### ' },
    { id: 'h5', label: 'h5', detail: 'H5 見出し', filterText: 'h5', sortOrder: '05', rawSnippet: '##### $0', previewMarkdown: '##### ' },
    { id: 'h6', label: 'h6', detail: 'H6 見出し', filterText: 'h6', sortOrder: '06', rawSnippet: '###### $0', previewMarkdown: '###### ' },
    {
        id: 'table',
        label: 'table',
        detail: 'テーブルを挿入 (2列)',
        filterText: 'table',
        sortOrder: '07',
        rawSnippet: '| ${1:Header 1} | ${2:Header 2} |\n| --- | --- |\n| $3 | $0 |',
        previewMarkdown: '| Header 1 | Header 2 |\n| --- | --- |\n|  |  |'
    },
    {
        id: 'code',
        label: 'code',
        detail: 'コードブロック',
        filterText: 'code',
        sortOrder: '08',
        rawSnippet: '```${1:bash}\n$0\n```',
        previewMarkdown: '```bash\n\n```'
    },
    { id: 'quote', label: 'quote', detail: '引用ブロック', filterText: 'quote', sortOrder: '09', rawSnippet: '> $0', previewMarkdown: '> ' },
    { id: 'divider', label: 'divider', detail: '水平線 (---)', filterText: 'divider', sortOrder: '10', rawSnippet: '---', previewMarkdown: '---' },
    { id: 'callout', label: 'callout', detail: 'コールアウト 💡', filterText: 'callout', sortOrder: '11', rawSnippet: '> 💡 $0', previewMarkdown: '> 💡 ' },
    { id: 'callout-warning', label: 'callout warning', detail: '警告コールアウト ⚠️', filterText: 'callout warning', sortOrder: '12', rawSnippet: '> ⚠️ $0', previewMarkdown: '> ⚠️ ' },
    { id: 'callout-danger', label: 'callout danger', detail: '危険コールアウト 🚨', filterText: 'callout danger', sortOrder: '13', rawSnippet: '> 🚨 $0', previewMarkdown: '> 🚨 ' },
    { id: 'callout-info', label: 'callout info', detail: '情報コールアウト ℹ️', filterText: 'callout info', sortOrder: '14', rawSnippet: '> ℹ️ $0', previewMarkdown: '> ℹ️ ' },
    { id: 'bullet', label: 'bullet', detail: '箇条書きリスト', filterText: 'bullet', sortOrder: '15', rawSnippet: '- $0', previewMarkdown: '- ' },
    { id: 'numbered', label: 'numbered', detail: '番号付きリスト', filterText: 'numbered', sortOrder: '16', rawSnippet: '1. $0', previewMarkdown: '1. ' },
    { id: 'todo', label: 'todo', detail: 'チェックボックス', filterText: 'todo', sortOrder: '17', rawSnippet: '- [ ] $0', previewMarkdown: '- [ ] ' },
    { id: 'toc', label: 'toc', detail: '目次を生成', filterText: 'toc', sortOrder: '18', rawSnippet: '/toc', previewMarkdown: '/toc' },
    { id: 'heading', label: 'heading', detail: '見出し (レベル指定)', filterText: 'heading', sortOrder: '19', rawSnippet: '/heading ${1:2} $0', previewMarkdown: '## ' }
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
