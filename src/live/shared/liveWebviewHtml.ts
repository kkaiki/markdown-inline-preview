/**
 * Live モード webview の HTML を組み立てる純関数。
 *
 * `liveEditorProvider.ts` は `vscode` に依存するため jsdom から import できない。
 * 「必要なスタイルシートを読み込み忘れる」類の事故（KaTeX の CSS を入れ忘れて
 * 数式が MathML と二重に見える、2026-08-05 に実際に踏んだ）をテストで防ぐため、
 * HTML の組み立てだけをここに切り出してある。
 */

export interface LiveWebviewAssets {
    /** webview バンドルの URI。 */
    scriptUri: string;
    /** Live モードのスタイルシート URI。 */
    styleUri: string;
    /** KaTeX のスタイルシート URI（数式の描画に必須）。 */
    katexStyleUri: string;
    /** CSP 文字列。 */
    csp: string;
    /** script タグの nonce。 */
    nonce: string;
}

export function buildLiveWebviewHtml(a: LiveWebviewAssets): string {
    return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${a.csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${a.katexStyleUri}">
<link rel="stylesheet" href="${a.styleUri}">
</head>
<body>
<div id="live-root" role="document"></div>
<script nonce="${a.nonce}" src="${a.scriptUri}"></script>
</body>
</html>`;
}
