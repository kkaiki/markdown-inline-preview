/**
 * 目次（Table of Contents）コマンドハンドラ
 */

import * as vscode from 'vscode';
import type { DebugLogFunction } from '../types';

interface TocHandlers {
    updateTableOfContents: (editor: vscode.TextEditor, autoMode: boolean) => Promise<void>;
}

let debugLog: DebugLogFunction = () => {};

export function setDebugLog(logFn: DebugLogFunction): void {
    debugLog = logFn;
}

/**
 * 目次更新コマンドハンドラを作成
 */
export function createUpdateTocHandler(handlers: TocHandlers): () => Promise<void> {
    return async () => {
        debugLog('[COMMAND] updateTableOfContents triggered');
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'markdown') {
            vscode.window.showWarningMessage('Markdownファイルを開いてください');
            return;
        }
        await handlers.updateTableOfContents(editor, false);
    };
}
