/**
 * テーブル操作ユーティリティ
 * テーブルの解析、整形、ナビゲーション関連の関数
 */

import type { CellBoundary, TableCellInfo, TableRow, TableBlock } from '../../types';
import { isSeparatorRow } from '../markdown/patterns';
import { getDisplayWidthWithHeuristics, isFullWidthCodePoint, padCell } from './width';

// VS Code document interface (minimal)
interface DocumentLike {
    lineCount: number;
    lineAt(line: number): { text: string };
}

/**
 * テーブル行をセルに分割
 */
export function splitTableLine(line: string): string[] | null {
    if (!line.includes('|')) return null;
    let cells = line.split('|');
    if (cells.length && cells[0].trim() === '') cells = cells.slice(1);
    if (cells.length && cells[cells.length - 1].trim() === '') cells = cells.slice(0, -1);
    return cells.map(c => c.trim());
}

/**
 * テーブル行から全セルの境界情報を取得
 */
export function getAllTableCells(lineText: string): CellBoundary[] | null {
    if (!lineText.includes('|')) return null;

    // セパレータ行は除外
    if (lineText.match(/^\s*\|?\s*[-:]+\s*\|/)) return null;

    const cellBoundaries: Array<{ start: number; end: number }> = [];
    let inCell = false;
    let cellStart = 0;

    for (let i = 0; i < lineText.length; i++) {
        if (lineText[i] === '|') {
            if (inCell) {
                cellBoundaries.push({ start: cellStart, end: i });
            }
            cellStart = i + 1;
            inCell = true;
        }
    }
    if (inCell && cellStart < lineText.length) {
        cellBoundaries.push({ start: cellStart, end: lineText.length });
    }

    return cellBoundaries.map((cell, index) => {
        const cellText = lineText.substring(cell.start, cell.end);
        const leadingMatch = cellText.match(/^(\s*)/);
        const leadingSpaces = leadingMatch ? leadingMatch[1].length : 0;
        const trailingMatch = cellText.match(/(\s*)$/);
        const trailingSpaces = trailingMatch ? trailingMatch[1].length : 0;
        let contentStart = cell.start + leadingSpaces;
        let contentEnd = cell.end - trailingSpaces;

        // 空セルや空白のみのセルは、セル先頭にカーソルを置く
        if (contentStart >= contentEnd) {
            contentStart = cell.start;
            contentEnd = cell.start;
        }

        return {
            start: cell.start,
            end: cell.end,
            contentStart,
            contentEnd,
            index: index
        };
    });
}

/**
 * カーソル位置のテーブルセル情報を取得
 */
export function getTableCellInfo(lineText: string, cursorChar: number): TableCellInfo | null {
    if (!lineText.includes('|')) {
        return null;
    }

    // セパレータ行はnullを返す
    if (lineText.match(/^\s*\|?\s*[-:]+\s*\|/)) {
        return null;
    }

    const allCells = getAllTableCells(lineText);
    if (!allCells) return null;

    // カーソル位置がどのセル内にあるか判定
    for (let i = 0; i < allCells.length; i++) {
        const cell = allCells[i];
        if (cursorChar >= cell.start && cursorChar <= cell.end) {
            return {
                isTable: true,
                cellStart: cell.start,
                cellEnd: cell.end,
                cellContentStart: cell.contentStart,
                cellContentEnd: cell.contentEnd,
                cellIndex: i,
                allCells: allCells
            };
        }
    }

    // カーソルが | の上にある場合
    if (lineText[cursorChar] === '|' && cursorChar + 1 < lineText.length) {
        for (let i = 0; i < allCells.length; i++) {
            if (allCells[i].start === cursorChar + 1) {
                const cell = allCells[i];
                return {
                    isTable: true,
                    cellStart: cell.start,
                    cellEnd: cell.end,
                    cellContentStart: cell.contentStart,
                    cellContentEnd: cell.contentEnd,
                    cellIndex: i,
                    allCells: allCells
                };
            }
        }
    }

    return {
        isTable: true,
        cellStart: 0,
        cellEnd: lineText.length,
        cellContentStart: 0,
        cellContentEnd: lineText.length,
        cellIndex: -1,
        allCells: allCells
    };
}

/**
 * テーブルブロックの範囲を検出
 */
export function findTableBlock(document: DocumentLike, lineIndex: number): TableBlock {
    const lineCount = document.lineCount;
    let start = lineIndex;
    let end = lineIndex;

    // 上へ拡張
    for (let i = lineIndex; i >= 0; i--) {
        const t = document.lineAt(i).text;
        if (t.includes('|')) {
            start = i;
        } else if (t.trim() !== '') {
            break;
        } else {
            break;
        }
    }

    // 下へ拡張
    for (let i = lineIndex + 1; i < lineCount; i++) {
        const t = document.lineAt(i).text;
        if (t.includes('|')) {
            end = i;
        } else if (t.trim() !== '') {
            break;
        } else {
            break;
        }
    }

    return { start, end };
}

/**
 * テーブルデータを解析
 */
export function parseTableRows(
    document: DocumentLike,
    startLine: number,
    endLine: number
): { rows: TableRow[]; maxCols: number } {
    const rows: TableRow[] = [];
    let maxCols = 0;

    for (let i = startLine; i <= endLine; i++) {
        const text = document.lineAt(i).text;
        if (!text.includes('|')) continue;
        const cells = splitTableLine(text);
        if (!cells || cells.length === 0) continue;
        rows.push({ line: i, cells, isSep: isSeparatorRow(cells) });
        maxCols = Math.max(maxCols, cells.length);
    }

    return { rows, maxCols };
}

/**
 * テーブル行をフォーマット
 */
export function formatTableRow(
    row: TableRow,
    colWidths: number[],
    colHasFullWidth: boolean[],
    maxCols: number
): string {
    let out = '|';
    if (row.isSep) {
        for (let c = 0; c < maxCols; c++) {
            const raw = (row.cells[c] || '').replace(/\s+/g, '');
            const left = raw.startsWith(':');
            const right = raw.endsWith(':');
            const dashes = '-'.repeat(Math.max(5, colWidths[c]));
            let seg = dashes;
            if (left && right) seg = ':' + dashes.slice(1, -1) + ':';
            else if (left) seg = ':' + dashes.slice(1);
            else if (right) seg = dashes.slice(0, -1) + ':';
            out += ' ' + seg + '|';
        }
    } else {
        for (let c = 0; c < maxCols; c++) {
            const cell = (row.cells[c] || '').trim();
            const padded = padCell(cell, colWidths[c], colHasFullWidth[c]);
            out += padded + '|';
        }
    }
    return out;
}

/**
 * 列幅を計算
 */
export function calculateColumnWidths(
    rows: TableRow[],
    maxCols: number
): { colWidths: number[]; colHasFullWidth: boolean[] } {
    const colWidths: number[] = Array(maxCols).fill(5);
    const colHasFullWidth: boolean[] = Array(maxCols).fill(false);

    for (const r of rows) {
        if (r.isSep) continue;
        for (let c = 0; c < maxCols; c++) {
            const cell = (r.cells[c] || '').trim();
            const w = Math.max(5, getDisplayWidthWithHeuristics(cell) + 2);
            if (w > colWidths[c]) colWidths[c] = w;

            if (!colHasFullWidth[c] && cell) {
                const hasFullWidth = [...cell].some(ch => {
                    const cp = ch.codePointAt(0);
                    return cp !== undefined && isFullWidthCodePoint(cp);
                });
                if (hasFullWidth) {
                    colHasFullWidth[c] = true;
                }
            }
        }
    }

    return { colWidths, colHasFullWidth };
}

// Re-export from patterns for convenience
export { isSeparatorRow };
