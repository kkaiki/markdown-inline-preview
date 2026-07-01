/**
 * Raw（テキストソース）と Preview（Milkdown / ProseMirror）でカーソル位置を引き継ぐための
 * 純粋なマッピング。両表現に共通して計算できる **「ブロック index + ブロック内オフセット」** を
 * アンカーにする。
 *
 * - ブロック index: トップレベルのブロック（段落・見出し・リスト・表・コード等）の 0 始まり番号。
 * - オフセット: そのブロックの先頭（行頭マーカーを除く）からの文字数。
 *
 * Raw 側のブロック分割は「空行で区切られた連続行 = 1 ブロック（フェンスコードは丸ごと 1 つ）」と
 * する。空行で区切る現在の Preview（段落間の空行を保持）と素直に対応する。完全な CommonMark
 * 解析ではないので、見出しの直後に空行なしで本文が続く等の稀なケースはズレ得る（その場合も
 * 近いブロックに着地する）。
 */

export interface CursorAnchor {
    /** トップレベルブロックの 0 始まり index。 */
    block: number;
    /** ブロック内のオフセット（行頭マーカーを除いた文字数）。 */
    offset: number;
}

export interface SourceBlock {
    startLine: number;
    lineCount: number;
}

/** 行頭マーカー（`#`・`-`・`1.`・`>`・`- [ ]`）の長さ（先頭空白込み）。無ければ 0。 */
export function blockPrefixLength(line: string): number {
    const m = /^(\s*)(#{1,6}\s+|[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+[.)]\s+|>\s+)/.exec(line);
    return m ? m[0].length : 0;
}

/** ソースを「空行区切りの連続行（フェンスコードは丸ごと）」でトップレベルブロックに分割する。 */
export function segmentBlocks(source: string): SourceBlock[] {
    const lines = source.split('\n');
    const blocks: SourceBlock[] = [];
    let inFence = false;
    let start = -1;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const isFence = /^\s*(```|~~~)/.test(line);

        if (inFence) {
            if (isFence) inFence = false; // 閉じフェンス。ブロックは継続（次の空行で確定）
            continue;
        }
        if (isFence) {
            if (start < 0) start = i;
            inFence = true;
            continue;
        }
        if (line.trim() === '') {
            if (start >= 0) {
                blocks.push({ startLine: start, lineCount: i - start });
                start = -1;
            }
            continue;
        }
        if (start < 0) start = i;
    }
    if (start >= 0) blocks.push({ startLine: start, lineCount: lines.length - start });
    return blocks;
}

/** Raw のカーソル（line, character）→ ブロックアンカー。 */
export function rawToCursorAnchor(source: string, line: number, character: number): CursorAnchor {
    const lines = source.split('\n');
    const blocks = segmentBlocks(source);
    if (blocks.length === 0) return { block: 0, offset: 0 };

    const blockIndex = blocks.findIndex(
        (b) => line >= b.startLine && line < b.startLine + b.lineCount
    );
    if (blockIndex < 0) {
        // 空行など、どのブロックにも属さない行 → 直後（無ければ直前）のブロック先頭に寄せる。
        const after = blocks.findIndex((b) => b.startLine >= line);
        return { block: after >= 0 ? after : blocks.length - 1, offset: 0 };
    }

    const b = blocks[blockIndex];
    let raw = 0;
    for (let l = b.startLine; l < line; l++) raw += (lines[l]?.length ?? 0) + 1; // +1 改行
    raw += character;
    const prefix = blockPrefixLength(lines[b.startLine] ?? '');
    return { block: blockIndex, offset: Math.max(0, raw - prefix) };
}

/** ブロックアンカー → Raw のカーソル（line, character）。 */
export function cursorAnchorToRaw(source: string, anchor: CursorAnchor): { line: number; character: number } {
    const lines = source.split('\n');
    const blocks = segmentBlocks(source);
    if (blocks.length === 0) return { line: 0, character: 0 };

    const b = blocks[Math.min(Math.max(anchor.block, 0), blocks.length - 1)];
    const prefix = blockPrefixLength(lines[b.startLine] ?? '');
    let remaining = Math.max(0, anchor.offset) + prefix;

    const lastLine = b.startLine + b.lineCount - 1;
    for (let l = b.startLine; l <= lastLine; l++) {
        const len = lines[l]?.length ?? 0;
        if (remaining <= len || l === lastLine) {
            return { line: l, character: Math.min(remaining, len) };
        }
        remaining -= len + 1; // +1 改行
    }
    return { line: b.startLine, character: Math.min(remaining, lines[b.startLine]?.length ?? 0) };
}
