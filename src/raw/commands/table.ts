/**
 * テーブル操作コマンドハンドラ
 * formatTable, tableNavigate*
 */

import * as vscode from 'vscode';
import type { TableCellInfo, CellBoundary, DebugLogFunction } from '../../types';

interface TableHandlers {
    formatTableAtLine: (editor: vscode.TextEditor, line: number) => void;
    getTableCellInfo: (lineText: string, cursorChar: number) => TableCellInfo | null;
    getAllTableCells: (lineText: string) => CellBoundary[] | null;
}

let debugLog: DebugLogFunction = () => {};

export function setDebugLog(logFn: DebugLogFunction): void {
    debugLog = logFn;
}

/**
 * テーブル整形コマンドハンドラを作成
 */
export function createFormatTableHandler(handlers: TableHandlers): () => void {
    return () => {
        debugLog('[COMMAND] Format Table command invoked');
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            debugLog('[COMMAND] No active editor');
            return;
        }
        const line = editor.selection.active.line;
        debugLog(`[COMMAND] Formatting table at line ${line}`);
        handlers.formatTableAtLine(editor, line);
    };
}

/**
 * テーブルナビゲーションコマンドハンドラを作成
 */
export function createTableNavigateHandler(
    handlers: TableHandlers,
    direction: 'right' | 'left'
): () => void {
    return () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;

        const position = editor.selection.active;
        const lineText = editor.document.lineAt(position.line).text;
        const cellInfo = handlers.getTableCellInfo(lineText, position.character);

        if (!cellInfo || !cellInfo.isTable || cellInfo.cellIndex < 0) {
            // テーブル外: デフォルトのTab/Shift+Tab動作
            if (direction === 'right') {
                vscode.commands.executeCommand('tab');
            } else {
                vscode.commands.executeCommand('outdent');
            }
            return;
        }

        if (direction === 'right') {
            // Tab: 次のセルへ
            if (cellInfo.cellIndex < cellInfo.allCells.length - 1) {
                const nextCell = cellInfo.allCells[cellInfo.cellIndex + 1];
                const newPosition = new vscode.Position(position.line, nextCell.contentStart);
                editor.selection = new vscode.Selection(newPosition, newPosition);
            }
            // 最後のセルの場合は何もしない（または次の行へ移動する実装も可能）
        } else {
            // Shift+Tab: 前のセルへ
            if (cellInfo.cellIndex > 0) {
                const prevCell = cellInfo.allCells[cellInfo.cellIndex - 1];
                const newPosition = new vscode.Position(position.line, prevCell.contentStart);
                editor.selection = new vscode.Selection(newPosition, newPosition);
            }
            // 最初のセルの場合は何もしない
        }
    };
}
