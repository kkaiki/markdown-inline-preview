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
export declare function setDebugLog(logFn: DebugLogFunction): void;
/**
 * スマートEnterコマンドハンドラを作成
 */
export declare function createSmartEnterHandler(handlers: ListHandlers): () => Promise<void>;
/**
 * 番号リスト再整形コマンドハンドラを作成
 */
export declare function createRenumberHandler(handlers: ListHandlers): () => void;
/**
 * リストタイプ変換コマンドハンドラを作成
 */
export declare function createConvertHandler(handlers: ListHandlers, targetType: ConvertType): () => void;
/**
 * チェックボックストグルコマンドハンドラを作成
 */
export declare function createToggleCheckboxHandler(handlers: ListHandlers): () => void;
/**
 * クリック向けチェックボックス切替コマンドハンドラを作成
 */
export declare function createClickCheckboxHandler(handlers: ListHandlers): () => void;
/**
 * 指定行のチェックボックス切替コマンドハンドラを作成
 */
export declare function createToggleCheckboxAtLineHandler(handlers: ListHandlers): (line?: number) => void;
/**
 * インデント調整コマンドハンドラを作成
 */
export declare function createIndentHandler(handlers: ListHandlers, increase: boolean): () => void;
export {};
//# sourceMappingURL=list.d.ts.map