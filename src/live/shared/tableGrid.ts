/**
 * 表のキーボード操作・範囲編集・貼り付けの純関数（requirements.md §2.7）。
 *
 * 表は畳んだまま各セルを個別の contenteditable で編集するので、セルをまたぐ操作
 * （上下の移動・範囲の伸縮・範囲を空にする・格子の貼り付け）はブラウザに任せられない。
 * ここはその「移動先」と「ソースの書き換え」だけを持ち、DOM には触らない。
 *
 * 行番号は区切り行を除いた 0 始まり（＝セルの `data-row`）で、行0 がヘッダ。
 */
import { parseTableCells } from './tableCells';
import { applyTableCommand, columnCount, contentLineIndexes, joinRow, splitRow } from './tableEdit';
import type { CellPos } from './tableSelection';

export type Direction = 'up' | 'down' | 'left' | 'right';

/** 行ごとのセル数（区切り行は数えない）。画面のセルと同じ数え方。 */
export function shapeOf(source: string): number[] {
    return parseTableCells(source, 0).map((r) => r.cells.length);
}

/** 列をその行のセル数に収める（列数が足りない行ではその行の最後のセル）。 */
function clampCol(shape: number[], row: number, col: number): number {
    return Math.max(0, Math.min(col, (shape[row] ?? 1) - 1));
}

/**
 * ↑ / ↓ の移動先。表の外へ出るときは 'above' / 'below'。
 */
export function verticalTarget(shape: number[], pos: CellPos, dir: 'up' | 'down'): CellPos | 'above' | 'below' {
    const row = pos.row + (dir === 'up' ? -1 : 1);
    if (row < 0) return 'above';
    if (row >= shape.length) return 'below';
    return { row, col: clampCol(shape, row, pos.col) };
}

/** 同じ列の先頭・最後、同じ行の最初・最後のセル（⌘ + 矢印）。 */
export function edgeCell(shape: number[], pos: CellPos, dir: Direction): CellPos {
    switch (dir) {
        case 'up':
            return { row: 0, col: clampCol(shape, 0, pos.col) };
        case 'down': {
            const row = shape.length - 1;
            return { row, col: clampCol(shape, row, pos.col) };
        }
        case 'left':
            return { row: pos.row, col: 0 };
        case 'right':
            return { row: pos.row, col: clampCol(shape, pos.row, Number.MAX_SAFE_INTEGER) };
    }
}

/**
 * 範囲の伸ばした側（フォーカス）を1セル、または端まで動かす（Shift / ⌘Shift + 矢印）。
 * 表の外へははみ出さない。
 */
export function extendFocus(shape: number[], focus: CellPos, dir: Direction, toEdge: boolean): CellPos {
    if (toEdge) return edgeCell(shape, focus, dir);
    const maxRow = shape.length - 1;
    switch (dir) {
        case 'up':
            return { row: Math.max(0, focus.row - 1), col: focus.col };
        case 'down':
            return { row: Math.min(maxRow, focus.row + 1), col: focus.col };
        case 'left':
            return { row: focus.row, col: Math.max(0, focus.col - 1) };
        case 'right':
            return { row: focus.row, col: clampCol(shape, focus.row, focus.col + 1) };
    }
}

/**
 * 選んだセルの中身を空にする差分（`base` を足した絶対位置）。パイプと前後の空白は残す。
 */
export function clearCellsChanges(
    source: string,
    base: number,
    cells: readonly CellPos[]
): { from: number; to: number; insert: string }[] {
    const rows = parseTableCells(source, base);
    const out: { from: number; to: number; insert: string }[] = [];
    for (const c of cells) {
        const cell = rows[c.row]?.cells[c.col];
        if (cell && cell.to > cell.from) out.push({ from: cell.from, to: cell.to, insert: '' });
    }
    return out;
}

/** セルに入れる1つ分の文字列: 改行は空白に、エスケープされていない `|` は `\|` に。 */
export function sanitizeCellText(text: string): string {
    return text.replace(/\r\n|\r|\n/g, ' ').replace(/(?<!\\)\|/g, '\\|');
}

/** タブ・改行区切りの文字列をセルの格子にする（末尾の改行は行にしない）。 */
export function parseClipboardGrid(text: string): string[][] {
    const lines = text.replace(/\r\n|\r/g, '\n').split('\n');
    if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
    return lines.map((line) => line.split('\t').map(sanitizeCellText));
}

/** セグメント（パイプ間の生文字列）の中身を置き換える。前後の空白は残し、空セルは ` text ` にする。 */
function replaceSegment(segment: string, text: string): string {
    if (segment.trim() === '') return text === '' ? segment : ` ${text} `;
    const lead = segment.length - segment.trimStart().length;
    const trail = segment.length - segment.trimEnd().length;
    return segment.slice(0, lead) + text + segment.slice(segment.length - trail);
}

/**
 * 格子を `start` のセルから右下へ流し込んだ新しいソース。
 * 表より下 / 右にはみ出す分は、行 / 列を足して全部入れる。
 */
export function pasteGrid(source: string, start: CellPos, grid: readonly string[][]): string {
    let out = source;
    const needRows = start.row + grid.length;
    const needCols = start.col + Math.max(0, ...grid.map((r) => r.length));

    while (columnCount(out.split('\n')) < needCols) {
        const next = applyTableCommand(out, { row: 0, col: columnCount(out.split('\n')) - 1 }, 'insertColumnRight');
        if (next === null) break;
        out = next;
    }
    while (contentLineIndexes(out.split('\n')).length < needRows) {
        const last = contentLineIndexes(out.split('\n')).length - 1;
        const next = applyTableCommand(out, { row: last, col: 0 }, 'insertRowBelow');
        if (next === null) break;
        out = next;
    }

    const lines = out.split('\n');
    const content = contentLineIndexes(lines);
    grid.forEach((cells, r) => {
        const lineIndex = content[start.row + r];
        if (lineIndex === undefined) return;
        const parts = splitRow(lines[lineIndex]);
        if (!parts) return;
        cells.forEach((text, c) => {
            const col = start.col + c;
            if (col < parts.segments.length) parts.segments[col] = replaceSegment(parts.segments[col], text);
        });
        lines[lineIndex] = joinRow(parts);
    });
    return lines.join('\n');
}
