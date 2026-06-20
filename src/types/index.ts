/**
 * 型定義ファイル
 * プロジェクト全体で使用される型を定義
 */

import type * as vscode from 'vscode';

// ========== テーブル関連 ==========

/**
 * セルの境界情報
 */
export interface CellBoundary {
    start: number;
    end: number;
    contentStart: number;
    contentEnd: number;
    index: number;
}

/**
 * テーブルセルの詳細情報
 */
export interface TableCellInfo {
    isTable: boolean;
    cellStart: number;
    cellEnd: number;
    cellContentStart: number;
    cellContentEnd: number;
    cellIndex: number;
    allCells: CellBoundary[];
}

/**
 * テーブル行のデータ
 */
export interface TableRow {
    line: number;
    cells: string[];
    isSep: boolean;
}

/**
 * テーブルブロックの範囲
 */
export interface TableBlock {
    start: number;
    end: number;
}

// ========== リスト関連 ==========

/**
 * リストのタイプ
 */
export type ListType = 'checkbox' | 'numbered' | 'bullet' | null;

/**
 * 変換対象のタイプ
 */
export type ConvertType = 'bullet' | 'numbered' | 'checkbox' | 'normal';

/**
 * 番号付きリストの情報
 */
export interface NumberedListInfo {
    indent: string;
    number: number;
    delimiter: string;
    content: string;
}

/**
 * チェックボックスの情報
 */
export interface CheckboxInfo {
    indent: string;
    checked: boolean;
    content: string;
}

/**
 * ブロック範囲
 */
export interface BlockRange {
    start: number;
    end: number;
}

// ========== パターン関連 ==========

/**
 * 行のタイプ
 */
export type LineType =
    | 'checkbox'
    | 'numbered'
    | 'bullet'
    | 'heading'
    | 'quote'
    | 'codeblock'
    | 'empty'
    | 'text';

/**
 * マーカー情報
 */
export interface MarkerInfo {
    contentStart: number;
    hasMarker: boolean;
    markerType: 'heading' | 'checkbox' | 'numbered' | 'bullet' | 'quote' | 'codeblock' | null;
}

/**
 * 見出し情報
 */
export interface HeadingInfo {
    level: number;
    text: string;
    line?: number;
}

// ========== コマンドハンドラ関連 ==========

/**
 * コマンドハンドラに渡されるハンドラ関数群
 */
export interface CommandHandlers {
    // リスト操作
    smartEnterCommand: () => Promise<void>;
    renumberLists: (editor: vscode.TextEditor) => void;
    convertLineToType: (editor: vscode.TextEditor, type: ConvertType) => void;
    toggleCheckbox: (editor: vscode.TextEditor, line: number) => void;
    adjustIndent: (editor: vscode.TextEditor, increase: boolean) => void;

    // テーブル操作
    formatTableAtLine: (editor: vscode.TextEditor, line: number) => void;
    getTableCellInfo: (lineText: string, cursorChar: number) => TableCellInfo | null;
    getAllTableCells: (lineText: string) => CellBoundary[] | null;

    // ナビゲーション
    moveLineWithHierarchy: (editor: vscode.TextEditor | undefined, direction: 'up' | 'down') => void;
}

// ========== 装飾関連 ==========

/**
 * デバッグログ関数の型
 */
export type DebugLogFunction = (message: string, ...args: unknown[]) => void;
