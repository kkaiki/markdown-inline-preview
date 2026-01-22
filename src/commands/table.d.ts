/**
 * テーブル操作コマンドハンドラ
 * formatTable, tableNavigate*
 */
import * as vscode from 'vscode';
import type { TableCellInfo, CellBoundary, DebugLogFunction } from '../types';
interface TableHandlers {
    formatTableAtLine: (editor: vscode.TextEditor, line: number) => void;
    getTableCellInfo: (lineText: string, cursorChar: number) => TableCellInfo | null;
    getAllTableCells: (lineText: string) => CellBoundary[] | null;
}
export declare function setDebugLog(logFn: DebugLogFunction): void;
/**
 * テーブル整形コマンドハンドラを作成
 */
export declare function createFormatTableHandler(handlers: TableHandlers): () => void;
/**
 * テーブルナビゲーションコマンドハンドラを作成
 */
export declare function createTableNavigateHandler(handlers: TableHandlers, direction: 'right' | 'left'): () => void;
export {};
