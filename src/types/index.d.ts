/**
 * 型定義ファイル
 * プロジェクト全体で使用される型を定義
 */
import type * as vscode from 'vscode';
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
/**
 * 行のタイプ
 */
export type LineType = 'checkbox' | 'numbered' | 'bullet' | 'heading' | 'quote' | 'codeblock' | 'empty' | 'text';
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
/**
 * TOCマーカー情報
 */
export interface TocMarkerInfo {
    hasMarker: boolean;
    markerType: 'japanese' | 'english' | null;
    line: number;
}
/**
 * TOCセクション範囲
 */
export interface TocSection {
    start: number;
    end: number;
}
/**
 * コマンドハンドラに渡されるハンドラ関数群
 */
export interface CommandHandlers {
    smartEnterCommand: () => Promise<void>;
    renumberLists: (editor: vscode.TextEditor) => void;
    convertLineToType: (editor: vscode.TextEditor, type: ConvertType) => void;
    toggleCheckbox: (editor: vscode.TextEditor, line: number) => void;
    adjustIndent: (editor: vscode.TextEditor, increase: boolean) => void;
    formatTableAtLine: (editor: vscode.TextEditor, line: number) => void;
    getTableCellInfo: (lineText: string, cursorChar: number) => TableCellInfo | null;
    getAllTableCells: (lineText: string) => CellBoundary[] | null;
    moveLineWithHierarchy: (editor: vscode.TextEditor | undefined, direction: 'up' | 'down') => void;
    updateTableOfContents: (editor: vscode.TextEditor, autoMode: boolean) => Promise<void>;
}
/**
 * デバッグログ関数の型
 */
export type DebugLogFunction = (message: string, ...args: unknown[]) => void;
//# sourceMappingURL=index.d.ts.map