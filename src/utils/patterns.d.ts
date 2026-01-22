/**
 * Markdown要素の正規表現パターン定義
 * 全てのパターンはここで一元管理
 */
import type { LineType, MarkerInfo, NumberedListInfo, CheckboxInfo, HeadingInfo } from '../types';
export declare const HEADING: RegExp;
export declare const HEADING_WITH_SPACE: RegExp;
export declare const CHECKBOX: RegExp;
export declare const CHECKBOX_MARKER: RegExp;
export declare const CHECKBOX_CHECKED: RegExp;
export declare const NUMBERED_LIST: RegExp;
export declare const NUMBERED_LIST_MARKER: RegExp;
export declare const NUMBERED_LIST_ANY: RegExp;
export declare const BULLET_LIST: RegExp;
export declare const BULLET_LIST_MARKER: RegExp;
export declare const QUOTE: RegExp;
export declare const QUOTE_MARKER: RegExp;
export declare const CODE_FENCE: RegExp;
export declare const CODE_FENCE_START: RegExp;
export declare const TABLE_SEPARATOR: RegExp;
export declare const TABLE_LINE: RegExp;
export declare const HORIZONTAL_RULE: RegExp;
export declare const ANY_LIST_ITEM: RegExp;
export declare const patterns: {
    HEADING: RegExp;
    HEADING_WITH_SPACE: RegExp;
    CHECKBOX: RegExp;
    CHECKBOX_MARKER: RegExp;
    CHECKBOX_CHECKED: RegExp;
    NUMBERED_LIST: RegExp;
    NUMBERED_LIST_MARKER: RegExp;
    NUMBERED_LIST_ANY: RegExp;
    BULLET_LIST: RegExp;
    BULLET_LIST_MARKER: RegExp;
    QUOTE: RegExp;
    QUOTE_MARKER: RegExp;
    CODE_FENCE: RegExp;
    CODE_FENCE_START: RegExp;
    TABLE_SEPARATOR: RegExp;
    TABLE_LINE: RegExp;
    HORIZONTAL_RULE: RegExp;
    ANY_LIST_ITEM: RegExp;
};
/**
 * 行のタイプを判定
 */
export declare function getLineType(line: string): LineType;
/**
 * マーカー終了位置を取得
 */
export declare function getMarkerInfo(text: string): MarkerInfo;
/**
 * 番号付きリストの情報を抽出
 */
export declare function extractNumberedList(line: string): NumberedListInfo | null;
/**
 * チェックボックスの情報を抽出
 */
export declare function extractCheckbox(line: string): CheckboxInfo | null;
/**
 * 見出しの情報を抽出
 */
export declare function extractHeading(line: string): HeadingInfo | null;
/**
 * リスト項目かどうかを判定
 */
export declare function isListItem(line: string): boolean;
/**
 * テーブルのセパレータ行かどうかを判定
 */
export declare function isSeparatorRow(cells: string[] | null | undefined): boolean;
