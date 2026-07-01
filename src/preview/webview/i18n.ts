/**
 * WebView（Milkdown）内の最小 i18n。
 *
 * WebView は `vscode.l10n` を使えない別コンテキストなので、ここで小さな翻訳辞書を持つ。
 * **ソース言語は英語**（コードには英語のキーを書く）。日本語表示のときだけ辞書で上書きし、
 * 訳が無ければソース（英語）にフォールバックする。表示言語はホストから `PreviewSettings.language`
 * （= `vscode.env.language`）で渡され、`setLanguage` で取り込む。
 */

/** 英語ソース文字列 → 日本語訳。キーはコード中に書く英語そのまま。 */
const JA: Record<string, string> = {
    // ツールバー（ブロック挿入）
    'Heading 1': '見出し 1',
    'Heading 2': '見出し 2',
    'Heading 3': '見出し 3',
    'Checkbox': 'チェックボックス',
    'Bullet list': '箇条書き',
    'Numbered list': '番号付きリスト',
    'Insert table': 'テーブルを挿入',
    'Quote': '引用',
    'Undo': '元に戻す',
    'Redo': 'やり直し',
    // ツールバー（ズーム / Export / モード）
    'Zoom out': '縮小',
    'Zoom in': '拡大',
    'Reset to 100%': '100% に戻す',
    'Export to PDF / Marp (Pro)': 'PDF / Marp で書き出す（Pro）',
    'Currently in Preview mode': '現在 Preview モードです',
    'Switch to Raw (Markdown source)': 'Raw（Markdown ソース）に切り替え',
    // テーブルツールバー
    'Add row below': '下に行を追加',
    'Add column right': '右に列を追加',
    'Delete row': '行を削除',
    'Delete column': '列を削除',
    'Delete table': '表を削除',
    '+ Row': '＋行',
    '+ Col': '＋列',
    '↑ Row': '↑行',
    '↓ Row': '↓行',
    '← Col': '←列',
    '→ Col': '→列',
    'Move row up': '行を上へ移動',
    'Move row down': '行を下へ移動',
    'Move column left': '列を左へ移動',
    'Move column right': '列を右へ移動',
    // 検索／置換バー
    'Find': '検索',
    'Replace': '置換',
    'Replace All': 'すべて置換',
    'Toggle Replace': '置換の切り替え',
    // スラッシュメニューの説明（detail）。Heading 1-3 / Bullet list / Numbered list /
    // Checkbox は上のツールバーと共通キー。
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
    'Heading (choose level)': '見出し (レベル指定)',
    // 初期化失敗
    '[Failed to initialize Preview. Please edit in Raw mode.]':
        '[Preview の初期化に失敗しました。Raw モードで編集してください]'
};

let isJa = false;

/** 表示言語を設定する（前方一致で日本語判定。`ja` / `ja-JP` 等）。 */
export function setLanguage(language: string | undefined): void {
    isJa = typeof language === 'string' && language.toLowerCase().startsWith('ja');
}

/** 英語ソース文字列を、現在の表示言語に応じて訳す。訳が無ければソースを返す。 */
export function t(en: string): string {
    return isJa ? (JA[en] ?? en) : en;
}
