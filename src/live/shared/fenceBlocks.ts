/**
 * コードフェンスのブロック検出。
 *
 * 装飾（syntaxRanges）と段階的な ⌘A（selectAllScope）の**両方**がこれを使う。
 * 以前は別々に実装していて規則が食い違い、「``` の中で ⌘A すると文書全体が
 * 選択される」不具合になっていた（ユーザー報告 2026-08-05）。判定はここ1箇所に集約する。
 *
 * 閉じフェンスの条件は CommonMark に合わせる:
 *   - 開きと同じ記号（``` か ~~~）
 *   - 開きと**同じ長さ以上**（4連の中の3連は閉じない）
 *   - info string を持たない
 */

export interface FenceBlock {
    /** 開始フェンスの行番号（0 始まり）。 */
    openLine: number;
    /** 終了フェンスの行番号。閉じられていなければ null。 */
    closeLine: number | null;
    /** 開始フェンスの info string（言語）。 */
    info: string;
    /** 開始フェンスの記号（``` / ```` / ~~~ など）。 */
    marker: string;
}

const FENCE_LINE = /^\s*(`{3,}|~{3,})(.*)$/;

export function findFenceBlocks(lines: readonly string[]): FenceBlock[] {
    const blocks: FenceBlock[] = [];
    let open: { line: number; marker: string; info: string } | null = null;

    for (let i = 0; i < lines.length; i++) {
        const m = FENCE_LINE.exec(lines[i]);
        if (!m) continue;
        const marker = m[1];
        const info = m[2].trim();

        if (open === null) {
            open = { line: i, marker, info };
            continue;
        }
        const closes =
            marker[0] === open.marker[0] && marker.length >= open.marker.length && info === '';
        if (closes) {
            blocks.push({ openLine: open.line, closeLine: i, info: open.info, marker: open.marker });
            open = null;
        }
    }
    if (open) blocks.push({ openLine: open.line, closeLine: null, info: open.info, marker: open.marker });
    return blocks;
}

/** オフセットを含むフェンスブロックを返す（行の範囲から探す）。 */
export function fenceBlockAt(
    lines: readonly string[],
    lineFrom: readonly number[],
    lineTo: (n: number) => number,
    offset: number
): FenceBlock | null {
    for (const b of findFenceBlocks(lines)) {
        const last = b.closeLine ?? lines.length - 1;
        if (offset >= lineFrom[b.openLine] && offset <= lineTo(last)) return b;
    }
    return null;
}
