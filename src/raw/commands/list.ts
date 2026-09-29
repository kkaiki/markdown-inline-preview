/**
 * リスト操作コマンドハンドラ
 * smartEnter, renumberLists, convertTo*, indent, toggleCheckbox
 */

import * as vscode from 'vscode';
import type { ConvertType, DebugLogFunction } from '../../types';

interface ListHandlers {
    smartEnterCommand: () => Promise<void>;
    // 編集の完了で解決する Thenable を返す。ハンドラはそれを返し、コマンドを編集の完了まで待たせる
    // （docs/specifications/fixes/raw-commands-await-edits.md）
    renumberLists: (editor: vscode.TextEditor) => Thenable<unknown>;
    convertLineToType: (editor: vscode.TextEditor, type: ConvertType) => Thenable<unknown>;
    toggleCheckbox: (editor: vscode.TextEditor, line: number) => Thenable<unknown>;
    adjustIndent: (editor: vscode.TextEditor, increase: boolean) => Thenable<unknown>;
}

let debugLog: DebugLogFunction = () => {};

export function setDebugLog(logFn: DebugLogFunction): void {
    debugLog = logFn;
}

/**
 * スマートEnterコマンドハンドラを作成
 */
export function createSmartEnterHandler(handlers: ListHandlers): () => Promise<void> {
    return async () => {
        debugLog('[COMMAND] smartEnter triggered');
        try {
            await handlers.smartEnterCommand();
        } catch (e) {
            const error = e as Error;
            debugLog(`[ERROR] smartEnter failed: ${error.message ?? String(e)}`);
            debugLog('[smartEnter] Error:', e);
            // 失敗時は通常の改行にフォールバック
            await vscode.commands.executeCommand('type', { text: '\n' });
        }
    };
}

/**
 * 番号リスト再整形コマンドハンドラを作成
 */
export function createRenumberHandler(handlers: ListHandlers): () => Thenable<unknown> | undefined {
    return () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        return handlers.renumberLists(editor);
    };
}

/**
 * リストタイプ変換コマンドハンドラを作成
 */
export function createConvertHandler(handlers: ListHandlers, targetType: ConvertType): () => Thenable<unknown> | undefined {
    return () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        return handlers.convertLineToType(editor, targetType);
    };
}

/**
 * チェックボックストグルコマンドハンドラを作成
 */
export function createToggleCheckboxHandler(handlers: ListHandlers): () => Thenable<unknown> | undefined {
    return () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        return handlers.toggleCheckbox(editor, editor.selection.active.line);
    };
}

/**
 * クリック向けチェックボックス切替コマンドハンドラを作成
 */
export function createClickCheckboxHandler(handlers: ListHandlers): () => Thenable<unknown> | undefined {
    return () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        return handlers.toggleCheckbox(editor, editor.selection.active.line);
    };
}

/**
 * 指定行のチェックボックス切替コマンドハンドラを作成
 */
export function createToggleCheckboxAtLineHandler(handlers: ListHandlers): (line?: number) => Thenable<unknown> | undefined {
    return (line?: number) => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        const targetLine = typeof line === 'number' ? line : editor.selection.active.line;
        return handlers.toggleCheckbox(editor, targetLine);
    };
}

/**
 * インデント調整コマンドハンドラを作成
 */
export function createIndentHandler(handlers: ListHandlers, increase: boolean): () => Thenable<unknown> | undefined {
    return () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        return handlers.adjustIndent(editor, increase);
    };
}
