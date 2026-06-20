/**
 * テーブル操作ユーティリティ
 * テーブルの解析、整形、ナビゲーション関連の関数
 */
import type { CellBoundary, TableCellInfo, TableRow, TableBlock } from '../types';
import { isSeparatorRow } from './patterns';
interface DocumentLike {
    lineCount: number;
    lineAt(line: number): {
        text: string;
    };
}
/**
 * テーブル行をセルに分割
 */
export declare function splitTableLine(line: string): string[] | null;
/**
 * テーブル行から全セルの境界情報を取得
 */
export declare function getAllTableCells(lineText: string): CellBoundary[] | null;
/**
 * カーソル位置のテーブルセル情報を取得
 */
export declare function getTableCellInfo(lineText: string, cursorChar: number): TableCellInfo | null;
/**
 * テーブルブロックの範囲を検出
 */
export declare function findTableBlock(document: DocumentLike, lineIndex: number): TableBlock;
/**
 * テーブルデータを解析
 */
export declare function parseTableRows(document: DocumentLike, startLine: number, endLine: number): {
    rows: TableRow[];
    maxCols: number;
};
/**
 * テーブル行をフォーマット
 */
export declare function formatTableRow(row: TableRow, colWidths: number[], colHasFullWidth: boolean[], maxCols: number): string;
/**
 * 列幅を計算
 */
export declare function calculateColumnWidths(rows: TableRow[], maxCols: number): {
    colWidths: number[];
    colHasFullWidth: boolean[];
};
export { isSeparatorRow };
//# sourceMappingURL=table.d.ts.map