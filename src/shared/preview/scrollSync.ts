/**
 * Preview（Milkdown WebView）と Raw（テキストエディタ）のスクロール位置同期に使う
 * 純粋な計算ロジック。VS Code / DOM には依存しないので単体テストで網羅できる。
 *
 * 同期の基本方針（docs/specifications/preview-scroll-sync.md を参照）:
 * - 第一候補は「見出しアンカー」。Markdown は 1 ソース行 = 1 表示行ではないため、
 *   最も近い見出しを共通の目印にするとモード切替で破綻しにくい。
 *   （アンカー探索自体は shared/structure/scrollAnchor の findScrollAnchor が担当）
 * - 見出しが無い箇所はスクロール比率（ratio: 0〜1）でフォールバックする。
 *
 * Raw 側は「行番号」、Preview 側は「ピクセル」で位置を持つため、両者を ratio に
 * 正規化してやり取りする。ここではその相互変換だけを扱う。
 */

/**
 * 行ベースのスクロール比率（先頭可視行 / 総行数）。
 * 1 行以下のドキュメントは同期する意味がないので undefined を返す。
 */
export function scrollRatioFromLine(topLine: number, lineCount: number): number | undefined {
    if (lineCount <= 1) return undefined;
    const clampedTop = Math.max(0, Math.min(topLine, lineCount - 1));
    return clampedTop / lineCount;
}

/**
 * ピクセルベースのスクロール比率（WebView 用）。
 * スクロール不能（分母 0）でも 0 を返し、0〜1 にクランプする。
 */
export function scrollRatioFromPixels(scrollTop: number, scrollHeight: number, clientHeight: number): number {
    const denom = Math.max(1, scrollHeight - clientHeight);
    return clampRatio(scrollTop / denom);
}

/** スクロール比率を行番号に戻す（0〜lineCount-1 にクランプ）。 */
export function lineFromScrollRatio(ratio: number, lineCount: number): number {
    if (lineCount <= 0) return 0;
    return Math.min(lineCount - 1, Math.max(0, Math.round(clampRatio(ratio) * lineCount)));
}

/** スクロール比率を WebView のスクロール量（px）に変換する。 */
export function pixelsFromScrollRatio(ratio: number, scrollHeight: number, clientHeight: number): number {
    return clampRatio(ratio) * Math.max(0, scrollHeight - clientHeight);
}

/** 0〜1 にクランプ。NaN は 0 として扱う。 */
function clampRatio(ratio: number): number {
    if (!Number.isFinite(ratio)) return 0;
    return Math.min(1, Math.max(0, ratio));
}
