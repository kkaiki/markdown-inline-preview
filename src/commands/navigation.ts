/**
 * ナビゲーションコマンドハンドラ
 * smartMove*, smartSelect*, moveLine*
 */

import * as vscode from 'vscode';
import type { TableCellInfo, CellBoundary, DebugLogFunction } from '../types';
import { getMarkerInfo } from '../utils/patterns';

interface NavigationHandlers {
    getTableCellInfo: (lineText: string, cursorChar: number) => TableCellInfo | null;
    getAllTableCells: (lineText: string) => CellBoundary[] | null;
    moveLineWithHierarchy: (editor: vscode.TextEditor | undefined, direction: 'up' | 'down') => void;
}

let debugLog: DebugLogFunction = () => {};

export function setDebugLog(logFn: DebugLogFunction): void {
    debugLog = logFn;
}

function getAlignedTablePosition(
    currentCellInfo: TableCellInfo,
    currentCharacter: number,
    targetCell: CellBoundary
): number {
    const isTargetEmpty = targetCell.contentStart >= targetCell.contentEnd;
    if (isTargetEmpty) {
        // Keep one padding space available when moving into an empty table cell.
        return Math.min(targetCell.start + 1, targetCell.end);
    }

    const offsetInContent = Math.max(0, currentCharacter - currentCellInfo.cellContentStart);
    const unclampedTarget = targetCell.contentStart + offsetInContent;
    return Math.max(targetCell.contentStart, Math.min(unclampedTarget, targetCell.contentEnd));
}

/**
 * スマートカーソル移動（左）コマンドハンドラを作成
 */
export function createSmartMoveLeftHandler(handlers: NavigationHandlers): () => void {
    return () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;

        const position = editor.selection.active;
        const line = editor.document.lineAt(position.line);
        const text = line.text;

        debugLog('[smartMoveLeft] Called at position:', position.character, 'line:', text);

        // テーブルセル内かどうかチェック
        const cellInfo = handlers.getTableCellInfo(text, position.character);
        debugLog('[smartMoveLeft] cellInfo:', cellInfo);

        if (cellInfo && cellInfo.isTable) {
            // テーブルセル内のナビゲーション
            let targetPos: number;

            if (position.character > cellInfo.cellContentStart) {
                // ケース1: セル内の途中 → コンテンツ開始位置へ
                targetPos = cellInfo.cellContentStart;
                debugLog('[smartMoveLeft] Case 1: Moving to content start:', targetPos);
            } else if (position.character > cellInfo.cellStart) {
                // ケース2: コンテンツ開始位置 → セル左端へ
                targetPos = cellInfo.cellStart;
                debugLog('[smartMoveLeft] Case 2: Moving to cell start:', targetPos);
            } else if (position.character === cellInfo.cellStart) {
                // ケース3: セル左端 → 前のセルまたは行頭へ
                if (cellInfo.cellIndex > 0) {
                    const prevCell = cellInfo.allCells[cellInfo.cellIndex - 1];
                    if (prevCell.contentEnd > prevCell.contentStart) {
                        targetPos = prevCell.contentEnd;
                        debugLog('[smartMoveLeft] Case 3a: Moving to prev cell content end:', targetPos);
                    } else {
                        targetPos = prevCell.contentStart;
                        debugLog('[smartMoveLeft] Case 3b: Moving to prev cell content start (empty):', targetPos);
                    }
                } else {
                    targetPos = 0;
                    debugLog('[smartMoveLeft] Case 3c: Moving to line start:', targetPos);
                }
            } else {
                vscode.commands.executeCommand('cursorWordLeft');
                return;
            }

            const newPosition = new vscode.Position(position.line, targetPos);
            editor.selection = new vscode.Selection(newPosition, newPosition);
            return;
        }

        // 非テーブル行: マーカー検出
        const markerInfo = getMarkerInfo(text);
        const contentStart = markerInfo.contentStart;

        const newPosition = new vscode.Position(position.line, contentStart);
        editor.selection = new vscode.Selection(newPosition, newPosition);
    };
}

/**
 * スマートカーソル移動（右）コマンドハンドラを作成
 */
export function createSmartMoveRightHandler(handlers: NavigationHandlers): () => void {
    return () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;

        const position = editor.selection.active;
        const line = editor.document.lineAt(position.line);
        const text = line.text;

        // テーブルセル内かどうかチェック
        const cellInfo = handlers.getTableCellInfo(text, position.character);

        if (cellInfo && cellInfo.isTable) {
            let targetPos: number;

            if (position.character < cellInfo.cellContentEnd) {
                // コンテンツ末尾へ
                targetPos = cellInfo.cellContentEnd;
            } else if (position.character < cellInfo.cellEnd) {
                // セル右端へ
                targetPos = cellInfo.cellEnd;
            } else if (cellInfo.cellIndex < cellInfo.allCells.length - 1) {
                // 次のセルのコンテンツ開始へ
                const nextCell = cellInfo.allCells[cellInfo.cellIndex + 1];
                targetPos = nextCell.contentStart;
            } else {
                // 行末へ
                targetPos = text.length;
            }

            const newPosition = new vscode.Position(position.line, targetPos);
            editor.selection = new vscode.Selection(newPosition, newPosition);
            return;
        }

        // 非テーブル行: 行末へ
        const newPosition = new vscode.Position(position.line, text.length);
        editor.selection = new vscode.Selection(newPosition, newPosition);
    };
}

/**
 * スマートカーソル移動（上）コマンドハンドラを作成
 */
export function createSmartMoveUpHandler(handlers: NavigationHandlers): () => void {
    return () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;

        const position = editor.selection.active;
        if (position.line === 0) {
            vscode.commands.executeCommand('cursorUp');
            return;
        }

        const currentLine = editor.document.lineAt(position.line).text;
        const prevLine = editor.document.lineAt(position.line - 1).text;

        const currentCellInfo = handlers.getTableCellInfo(currentLine, position.character);
        const prevLineCells = handlers.getAllTableCells(prevLine);

        if (currentCellInfo && currentCellInfo.isTable && prevLineCells) {
            // テーブル内: 同じセルインデックスとセル内オフセットを維持
            const targetCellIndex = Math.min(currentCellInfo.cellIndex, prevLineCells.length - 1);
            if (targetCellIndex >= 0) {
                const targetCell = prevLineCells[targetCellIndex];
                const targetCharacter = getAlignedTablePosition(currentCellInfo, position.character, targetCell);
                const newPosition = new vscode.Position(position.line - 1, targetCharacter);
                editor.selection = new vscode.Selection(newPosition, newPosition);
                return;
            }
        }

        vscode.commands.executeCommand('cursorUp');
    };
}

/**
 * スマートカーソル移動（下）コマンドハンドラを作成
 */
export function createSmartMoveDownHandler(handlers: NavigationHandlers): () => void {
    return () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;

        const position = editor.selection.active;
        if (position.line >= editor.document.lineCount - 1) {
            vscode.commands.executeCommand('cursorDown');
            return;
        }

        const currentLine = editor.document.lineAt(position.line).text;
        const nextLine = editor.document.lineAt(position.line + 1).text;

        const currentCellInfo = handlers.getTableCellInfo(currentLine, position.character);
        const nextLineCells = handlers.getAllTableCells(nextLine);

        if (currentCellInfo && currentCellInfo.isTable && nextLineCells) {
            // テーブル内: 同じセルインデックスとセル内オフセットを維持
            const targetCellIndex = Math.min(currentCellInfo.cellIndex, nextLineCells.length - 1);
            if (targetCellIndex >= 0) {
                const targetCell = nextLineCells[targetCellIndex];
                const targetCharacter = getAlignedTablePosition(currentCellInfo, position.character, targetCell);
                const newPosition = new vscode.Position(position.line + 1, targetCharacter);
                editor.selection = new vscode.Selection(newPosition, newPosition);
                return;
            }
        }

        vscode.commands.executeCommand('cursorDown');
    };
}

/**
 * スマート選択（左）コマンドハンドラを作成
 */
export function createSmartSelectLeftHandler(handlers: NavigationHandlers): () => void {
    return () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;

        const selection = editor.selection;
        const position = selection.active;
        const line = editor.document.lineAt(position.line);
        const text = line.text;

        // テーブルセル内かどうかチェック
        const cellInfo = handlers.getTableCellInfo(text, position.character);
        if (cellInfo && cellInfo.isTable) {
            const anchorChar = selection.anchor.character;
            const activeChar = selection.active.character;

            if (selection.isEmpty) {
                if (position.character <= cellInfo.cellContentStart) {
                    // セルの左端まで選択
                    const newSelection = new vscode.Selection(
                        new vscode.Position(position.line, position.character),
                        new vscode.Position(position.line, cellInfo.cellStart)
                    );
                    editor.selection = newSelection;
                } else {
                    // コンテンツ開始位置まで選択
                    const newSelection = new vscode.Selection(
                        new vscode.Position(position.line, position.character),
                        new vscode.Position(position.line, cellInfo.cellContentStart)
                    );
                    editor.selection = newSelection;
                }
            } else {
                // 選択を拡張
                if (activeChar > cellInfo.cellContentStart) {
                    const newSelection = new vscode.Selection(
                        new vscode.Position(position.line, anchorChar),
                        new vscode.Position(position.line, cellInfo.cellContentStart)
                    );
                    editor.selection = newSelection;
                } else if (activeChar > cellInfo.cellStart) {
                    const newSelection = new vscode.Selection(
                        new vscode.Position(position.line, anchorChar),
                        new vscode.Position(position.line, cellInfo.cellStart)
                    );
                    editor.selection = newSelection;
                } else if (activeChar === cellInfo.cellStart && cellInfo.cellIndex > 0) {
                    const prevCell = cellInfo.allCells[cellInfo.cellIndex - 1];
                    const targetPos = prevCell.contentEnd > prevCell.contentStart
                        ? prevCell.contentEnd
                        : prevCell.contentStart;
                    const newSelection = new vscode.Selection(
                        new vscode.Position(position.line, anchorChar),
                        new vscode.Position(position.line, targetPos)
                    );
                    editor.selection = newSelection;
                } else {
                    const newSelection = new vscode.Selection(
                        new vscode.Position(position.line, anchorChar),
                        new vscode.Position(position.line, 0)
                    );
                    editor.selection = newSelection;
                }
            }
            return;
        }

        // 非テーブル行
        const markerInfo = getMarkerInfo(text);
        const contentStart = markerInfo.contentStart;

        if (selection.isEmpty) {
            if (position.character <= contentStart) {
                // 行頭まで選択
                const newSelection = new vscode.Selection(
                    new vscode.Position(position.line, position.character),
                    new vscode.Position(position.line, 0)
                );
                editor.selection = newSelection;
            } else {
                // コンテンツ開始位置まで選択
                const newSelection = new vscode.Selection(
                    new vscode.Position(position.line, position.character),
                    new vscode.Position(position.line, contentStart)
                );
                editor.selection = newSelection;
            }
        } else {
            // 既に選択がある場合: 行頭まで拡張
            const newSelection = new vscode.Selection(
                selection.anchor,
                new vscode.Position(position.line, 0)
            );
            editor.selection = newSelection;
        }
    };
}

/**
 * スマート選択（全体）コマンドハンドラを作成
 */
export function createSmartSelectAllHandler(handlers: NavigationHandlers): () => void {
    return () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;

        const position = editor.selection.active;
        const document = editor.document;
        const currentLine = document.lineAt(position.line).text;

        // テーブル内のチェック
        const cellInfo = handlers.getTableCellInfo(currentLine, position.character);
        if (cellInfo && cellInfo.isTable) {
            const curSel = editor.selection;

            const cellContentSelection = new vscode.Selection(
                new vscode.Position(position.line, cellInfo.cellContentStart),
                new vscode.Position(position.line, cellInfo.cellContentEnd)
            );

            const rowSelection = new vscode.Selection(
                new vscode.Position(position.line, 0),
                new vscode.Position(position.line, currentLine.length)
            );

            const isCellContentSelected =
                curSel.start.line === cellContentSelection.start.line &&
                curSel.start.character === cellContentSelection.start.character &&
                curSel.end.line === cellContentSelection.end.line &&
                curSel.end.character === cellContentSelection.end.character;

            const isRowSelected =
                curSel.start.line === rowSelection.start.line &&
                curSel.start.character === rowSelection.start.character &&
                curSel.end.line === rowSelection.end.line &&
                curSel.end.character === rowSelection.end.character;

            if (isRowSelected) {
                vscode.commands.executeCommand('editor.action.selectAll');
            } else if (isCellContentSelected) {
                editor.selection = rowSelection;
            } else {
                editor.selection = cellContentSelection;
            }
            return;
        }

        // コードブロック内のチェック
        let inFence = false;
        let fenceStart = -1;
        let fenceEnd = -1;

        for (let i = 0; i < document.lineCount; i++) {
            const t = document.lineAt(i).text;
            if (t.startsWith('```')) {
                if (!inFence) {
                    inFence = true;
                    fenceStart = i;
                } else {
                    fenceEnd = i;
                    if (position.line > fenceStart && position.line < fenceEnd) {
                        const startPos = new vscode.Position(fenceStart + 1, 0);
                        const endPos = new vscode.Position(fenceEnd, 0);
                        const desired = new vscode.Selection(startPos, endPos);

                        const curSel = editor.selection;
                        const sameAsDesired = curSel.start.line === desired.start.line &&
                            curSel.start.character === desired.start.character &&
                            curSel.end.line === desired.end.line &&
                            curSel.end.character === desired.end.character;

                        if (sameAsDesired) {
                            vscode.commands.executeCommand('editor.action.selectAll');
                        } else {
                            editor.selection = desired;
                        }
                        return;
                    } else {
                        inFence = false;
                        fenceStart = -1;
                        fenceEnd = -1;
                    }
                }
            }
        }

        vscode.commands.executeCommand('editor.action.selectAll');
    };
}

/**
 * 行移動コマンドハンドラを作成
 */
export function createMoveLineHandler(
    handlers: NavigationHandlers,
    direction: 'up' | 'down'
): () => void {
    return () => {
        handlers.moveLineWithHierarchy(vscode.window.activeTextEditor, direction);
    };
}
