/**
 * webview（Live モード）の UI 文字列。
 *
 * ユーザー指示（2026-09-12）:「エディタの設定に従い、基本的には英語にしつつ、
 * 日本語の時は日本語に対応するようにしてほしい」。
 *
 * ソース文字列は**英語**にして、日本語だけ辞書で上書きする（ホスト側の
 * `vscode.l10n.t` と同じ方式。訳が無ければ英語がそのまま出る）。
 * ロケールは host が `init` メッセージで渡す `vscode.env.language`。
 *
 * 訳し忘れは `test/suite/live/rendering/webviewStrings.test.ts` が
 * ソースの `t('…')` を走査して検出する。
 */

/** 英語ソース文字列 → 日本語。 */
export const JA_STRINGS: Record<string, string> = {
    // ツールバー（ブロック変換・インライン書式）
    'Heading 1': '見出し 1',
    'Heading 2': '見出し 2',
    'Heading 3': '見出し 3',
    Checkbox: 'チェックボックス',
    'Bulleted list': '箇条書き',
    'Numbered list': '番号付きリスト',
    Quote: '引用',
    'Toggle list': 'トグルリスト',
    Bold: '太字',
    Italic: '斜体',
    Underline: '下線',
    Strikethrough: '取り消し線',
    'Inline code': 'インラインコード',
    Link: 'リンク',
    // ツールバー（拡大率・モード）
    'Zoom out': '縮小',
    'Zoom in': '拡大',
    'Reset zoom to 100%': '拡大率を 100% に戻す',
    'Export to PDF (free)': 'PDF に書き出す（無料）',
    'Export to PDF (free; PRO+ removes the credit line)': 'PDF に書き出す（無料。PRO+ でクレジット行を消せます）',
    'Export to Word (.docx)': 'Word（.docx）に書き出す',
    'Export to Word (.docx) (PRO+: purchase required)': 'Word（.docx）に書き出す（PRO+：購入が必要です）',
    'Export as Slides (Marp PDF)': 'スライド（Marp PDF）に書き出す',
    'Export as Slides (Marp PDF) (PRO+: purchase required)': 'スライド（Marp PDF）に書き出す（PRO+：購入が必要です）',
    'Open in Raw mode': 'Raw モードで開く',
    // 表
    'Select row': '行を選択',
    'Select column': '列を選択',
    'Insert row above': '上に行を挿入',
    'Insert row below': '下に行を挿入',
    'Insert column left': '左に列を挿入',
    'Insert column right': '右に列を挿入',
    'Delete row': '行を削除',
    'Delete column': '列を削除',
    'Delete table': '表を削除',
    'Resize column': '列幅を変更',
    // 差分ガター
    'Added line': '追加された行',
    'Modified line': '変更された行',
    'Previous line deleted': '前の行が削除されている',
    // スラッシュメニュー（`SLASH_MENU_ITEMS` の detail と同じ文字列）
    'Heading 4': '見出し 4',
    'Heading 5': '見出し 5',
    'Heading 6': '見出し 6',
    'Insert table (2 columns)': 'テーブルを挿入 (2列)',
    'Code block': 'コードブロック',
    'Quote block': '引用ブロック',
    'Divider (---)': '水平線 (---)',
    'Callout 💡': 'コールアウト 💡',
    'Warning callout ⚠️': '警告コールアウト ⚠️',
    'Danger callout 🚨': '危険コールアウト 🚨',
    'Info callout ℹ️': '情報コールアウト ℹ️',
    'Bullet list': '箇条書きリスト',
    'Heading (choose level)': '見出し (レベル指定)',
    // ⌘F 検索パネル（用語は VS Code 日本語版に合わせる）
    Find: '検索',
    Replace: '置換',
    'Replace All': 'すべて置換',
    'Toggle Replace': '置換の切り替え',
    'Match Case': '大文字と小文字を区別する',
    'Match Whole Word': '単語単位で検索する',
    'Use Regular Expression': '正規表現を使用する',
    'Previous Match': '前の一致項目',
    'Next Match': '次の一致項目',
    Close: '閉じる',
    'No results': '結果なし',
    '{0} of {1}': '{1} 件中 {0} 件'
};

/**
 * CodeMirror 標準の UI（「行へ移動」パネル）の文言。キーは CodeMirror が `state.phrase()` に渡す英語そのまま。
 * `EditorState.phrases` に渡す辞書として使うため、`t('…')` の走査対象にはしない。
 * 検索パネルは独自実装（liveSearchPanel.ts）で、文言は上の JA_STRINGS にある。
 */
export const JA_SEARCH_PHRASES: Record<string, string> = {
    'Go to line': '行へ移動',
    go: '移動'
};

/** ロケールに応じた検索パネルの文言辞書（英語は CodeMirror 既定のまま＝空）。 */
export function searchPhrases(locale: string | undefined): Record<string, string> {
    return isJapaneseLocale(locale) ? JA_SEARCH_PHRASES : {};
}

/** VS Code のロケール（`vscode.env.language`）が日本語か。 */
export function isJapaneseLocale(locale: string | undefined): boolean {
    return (locale ?? '').toLowerCase().split('-')[0] === 'ja';
}

export type Translate = (source: string) => string;

/** ロケールに応じた翻訳関数を作る。訳が無ければ英語のソース文字列をそのまま返す。 */
export function createTranslator(locale: string | undefined): Translate {
    if (!isJapaneseLocale(locale)) return (source) => source;
    return (source) => JA_STRINGS[source] ?? source;
}
