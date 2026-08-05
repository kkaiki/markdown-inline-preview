/**
 * 段階的な全選択（⌘A を押すたびに範囲が広がる）。
 *
 * ユーザー指示（2026-08-05）:
 *   表のセル → その行 → 表全体 → ファイル全体、
 *   コードフェンスも同じく 中身 → ブロック全体 → ファイル全体。
 *
 * 直前の選択範囲を見て「今どの段階か」を判定し、次の段階を返す。
 * 段階の判定に状態を持たないので、外部から選択を変えられても破綻しない。
 */

export interface TextRange {
    from: number;
    to: number;
}

/** 行の範囲（改行を含まない）を求める。 */
function lineRangeAt(doc: string, offset: number): TextRange {
    const from = doc.lastIndexOf('\n', Math.max(0, offset - 1)) + 1;
    const nl = doc.indexOf('\n', offset);
    return { from, to: nl === -1 ? doc.length : nl };
}

/** 行番号 → その行の [from, to]（改行を含まない）。 */
function lineRanges(doc: string): TextRange[] {
    const out: TextRange[] = [];
    let from = 0;
    for (;;) {
        const nl = doc.indexOf('\n', from);
        if (nl === -1) {
            out.push({ from, to: doc.length });
            break;
        }
        out.push({ from, to: nl });
        from = nl + 1;
    }
    return out;
}

import { findFenceBlocks } from './fenceBlocks';

const TABLE_ROW = /\|/;
const TABLE_DELIM = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

/**
 * オフセットを含むコードフェンスブロックの範囲（本文とブロック全体）。
 *
 * ブロックの検出は装飾側と**同じ関数**を使う。以前は別実装で規則が食い違い、
 * 「``` の中で ⌘A すると文書全体が選択される」不具合になっていた
 * （ユーザー報告 2026-08-05）。
 */
function fenceAt(doc: string, offset: number): { body: TextRange | null; block: TextRange } | null {
    const lines = lineRanges(doc);
    const texts = lines.map((l) => doc.slice(l.from, l.to));
    for (const b of findFenceBlocks(texts)) {
        const lastLine = b.closeLine ?? lines.length - 1;
        const block = { from: lines[b.openLine].from, to: lines[lastLine].to };
        if (offset < block.from || offset > block.to) continue;
        const firstBody = b.openLine + 1;
        const lastBody = (b.closeLine ?? lines.length) - 1;
        // 本文行が無いフェンス（``` の直後に ```）は「中」が存在しないので body は null
        const body =
            firstBody <= lastBody ? { from: lines[firstBody].from, to: lines[lastBody].to } : null;
        return { body, block };
    }
    return null;
}

/** オフセットを含む表ブロックの範囲。 */
function tableAt(doc: string, offset: number): TextRange | null {
    const lines = lineRanges(doc);
    for (let i = 0; i + 1 < lines.length; i++) {
        const head = doc.slice(lines[i].from, lines[i].to);
        const delim = doc.slice(lines[i + 1].from, lines[i + 1].to);
        if (!TABLE_ROW.test(head) || !TABLE_DELIM.test(delim) || !delim.includes('-')) continue;
        let end = i + 1;
        while (end + 1 < lines.length) {
            const next = doc.slice(lines[end + 1].from, lines[end + 1].to);
            if (!TABLE_ROW.test(next) || next.trim() === '') break;
            end += 1;
        }
        const range = { from: lines[i].from, to: lines[end].to };
        if (offset >= range.from && offset <= range.to) return range;
        i = end;
    }
    return null;
}

function same(a: TextRange, b: TextRange): boolean {
    return a.from === b.from && a.to === b.to;
}

/**
 * 次に選択すべき範囲を返す。
 *
 * @param doc ドキュメント全体
 * @param selection 現在の選択（カーソルなら from === to）
 */
export function nextSelectAllRange(doc: string, selection: TextRange): TextRange {
    const whole = { from: 0, to: doc.length };
    const at = selection.from;

    const fence = fenceAt(doc, at);
    if (fence) {
        // 本文が無いフェンスは「中」を選べないので、いきなりブロック全体
        if (!fence.body) return same(selection, fence.block) ? whole : fence.block;
        if (!same(selection, fence.body) && !same(selection, fence.block)) return fence.body;
        if (same(selection, fence.body)) return fence.block;
        return whole;
    }

    const table = tableAt(doc, at);
    if (table) {
        const row = lineRangeAt(doc, at);
        if (!same(selection, row) && !same(selection, table)) return row;
        if (same(selection, row)) return table;
        return whole;
    }

    return whole;
}
