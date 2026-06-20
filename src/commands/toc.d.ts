/**
 * 目次（Table of Contents）コマンドハンドラ
 */
import * as vscode from 'vscode';
import type { DebugLogFunction } from '../types';
interface TocHandlers {
    updateTableOfContents: (editor: vscode.TextEditor, autoMode: boolean) => Promise<void>;
}
export declare function setDebugLog(logFn: DebugLogFunction): void;
/**
 * 目次更新コマンドハンドラを作成
 */
export declare function createUpdateTocHandler(handlers: TocHandlers): () => Promise<void>;
export {};
//# sourceMappingURL=toc.d.ts.map