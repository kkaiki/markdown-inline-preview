/**
 * host（VS Code / Cursor 本体）から送られてくる「すべて選択」の扱い。
 *
 * 本体は webview にフォーカスがあるとき ⌘A を**自分でも処理**し、webview 側が
 * `preventDefault()` していても `document.execCommand('selectAll')` を送ってくる。
 * その結果、段階的な ⌘A（`selectAllScope.ts`）の結果が毎回そのあとで文書全体に
 * 上書きされていた（ユーザー報告 2026-08-09）。
 *
 * 実 VS Code の webview に CDP で接続して計測した時系列（手順と生ログは
 * docs/testing/vscode-webview-cdp-debug.md）:
 *   477ms  CM の段階選択が中身を選ぶ / defaultPrevented=true
 *   486ms  本体が execCommand('selectAll') を送る → 文書全体へ上書き（9ms 後）
 *
 * **判定を時間でやってはいけない。** 上書きが遅れて届くと猶予をすり抜け、段階が勝手に
 * 1つ進む（行を選んだつもりが表全体になり「行がコピーできない」に見える）。
 * 「最後に自分が設定した選択のままか」という**状態**で判定する。
 *
 * 仕様は docs/specifications/live-mode/requirements.md §3.4.3。
 */

export interface SelectionRange {
    from: number;
    to: number;
}

/**
 * host からの `selectAll` を無視すべきか。
 *
 * @param lastApplied 段階的な ⌘A で最後に設定した選択（まだ一度も押していなければ null）
 * @param current 現在の選択
 */
export function shouldIgnoreHostSelectAll(
    lastApplied: SelectionRange | null,
    current: SelectionRange
): boolean {
    if (lastApplied === null) return false;
    return lastApplied.from === current.from && lastApplied.to === current.to;
}
