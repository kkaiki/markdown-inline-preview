/**
 * ナビゲーションコマンドハンドラ
 * smartMove*, smartSelect*, moveLine*
 */
import * as vscode from 'vscode';
import type { TableCellInfo, CellBoundary, DebugLogFunction } from '../types';
interface NavigationHandlers {
    getTableCellInfo: (lineText: string, cursorChar: number) => TableCellInfo | null;
    getAllTableCells: (lineText: string) => CellBoundary[] | null;
    moveLineWithHierarchy: (editor: vscode.TextEditor | undefined, direction: 'up' | 'down') => void;
}
export declare function setDebugLog(logFn: DebugLogFunction): void;
/**
 * スマートカーソル移動（左）コマンドハンドラを作成
 */
export declare function createSmartMoveLeftHandler(handlers: NavigationHandlers): () => void;
/**
 * スマートカーソル移動（右）コマンドハンドラを作成
 */
export declare function createSmartMoveRightHandler(handlers: NavigationHandlers): () => void;
/**
 * スマートカーソル移動（上）コマンドハンドラを作成
 */
export declare function createSmartMoveUpHandler(handlers: NavigationHandlers): () => void;
/**
 * スマートカーソル移動（下）コマンドハンドラを作成
 */
export declare function createSmartMoveDownHandler(handlers: NavigationHandlers): () => void;
/**
 * スマート選択（左）コマンドハンドラを作成
 */
export declare function createSmartSelectLeftHandler(handlers: NavigationHandlers): () => void;
/**
 * スマート選択（全体）コマンドハンドラを作成
 */
export declare function createSmartSelectAllHandler(handlers: NavigationHandlers): () => void;
/**
 * 行移動コマンドハンドラを作成
 */
export declare function createMoveLineHandler(handlers: NavigationHandlers, direction: 'up' | 'down'): () => void;
export {};
