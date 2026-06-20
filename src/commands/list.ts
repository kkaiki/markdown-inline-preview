/**
 * リスト操作コマンドハンドラ
 * smartEnter, renumberLists, convertTo*, indent, toggleCheckbox
 */

import * as vscode from 'vscode';
import type { ConvertType, DebugLogFunction } from '../types';

interface ListHandlers {
    smartEnterCommand: () => Promise<void>;
    renumberLists: (editor: vscode.TextEditor) => void;
    convertLineToType: (editor: vscode.TextEditor, type: ConvertType) => void;
    toggleCheckbox: (editor: vscode.TextEditor, line: number) => void;
    adjustIndent: (editor: vscode.TextEditor, increase: boolean) => void;
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
export function createRenumberHandler(handlers: ListHandlers): () => void {
    return () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        handlers.renumberLists(editor);
    };
}

/**
 * リストタイプ変換コマンドハンドラを作成
 */
export function createConvertHandler(handlers: ListHandlers, targetType: ConvertType): () => void {
    return () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        handlers.convertLineToType(editor, targetType);
    };
}

/**
 * チェックボックストグルコマンドハンドラを作成
 */
export function createToggleCheckboxHandler(handlers: ListHandlers): () => void {
    return () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        handlers.toggleCheckbox(editor, editor.selection.active.line);
    };
}

/**
 * クリック向けチェックボックス切替コマンドハンドラを作成
 */
export function createClickCheckboxHandler(handlers: ListHandlers): () => void {
    return () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        handlers.toggleCheckbox(editor, editor.selection.active.line);
    };
}

/**
 * 指定行のチェックボックス切替コマンドハンドラを作成
 */
export function createToggleCheckboxAtLineHandler(handlers: ListHandlers): (line?: number) => void {
    return (line?: number) => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        const targetLine = typeof line === 'number' ? line : editor.selection.active.line;
        handlers.toggleCheckbox(editor, targetLine);
    };
}

/**
 * インデント調整コマンドハンドラを作成
 */
export function createIndentHandler(handlers: ListHandlers, increase: boolean): () => void {
    return () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        handlers.adjustIndent(editor, increase);
    };
}
