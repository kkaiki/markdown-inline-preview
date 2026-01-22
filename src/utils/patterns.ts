/**
 * Markdown要素の正規表現パターン定義
 * 全てのパターンはここで一元管理
 */

import type {
    LineType,
    MarkerInfo,
    NumberedListInfo,
    CheckboxInfo,
    HeadingInfo
} from '../types';

// ========== 正規表現パターン定義 ==========

// 見出し
export const HEADING = /^(#{1,6})\s+(.*)$/;
export const HEADING_WITH_SPACE = /^(#{1,6}\s+)/;

// チェックボックス
export const CHECKBOX = /^(\s*)-\s\[([xX ]?)\]\s*(.*)/;
export const CHECKBOX_MARKER = /^(\s*-\s\[[\sx]?\]\s*)/i;
export const CHECKBOX_CHECKED = /^\s*-\s\[[xX]\]\s*/;

// 番号付きリスト
export const NUMBERED_LIST = /^(\s*)(\d+)([\.)])\s*(.*)/;
export const NUMBERED_LIST_MARKER = /^(\s*\d+\.\s+)/;
export const NUMBERED_LIST_ANY = /^(\s*)(\d+)([\.)])\s*/;

// 箇条書きリスト
export const BULLET_LIST = /^(\s*)([-*+])\s+(.*)/;
export const BULLET_LIST_MARKER = /^(\s*[-*+]\s+)/;

// 引用
export const QUOTE = /^(>\s*)+/;
export const QUOTE_MARKER = /^(>\s*)+/;

// コードブロック
export const CODE_FENCE = /^(```\w*\s*)/;
export const CODE_FENCE_START = /^```(\w*)?$/;

// テーブル
export const TABLE_SEPARATOR = /^:?-+:?$/;
export const TABLE_LINE = /\|/;

// 水平線
export const HORIZONTAL_RULE = /^(\s*)([-*_])\2{2,}\s*$/;

// リスト判定（包括的）
export const ANY_LIST_ITEM = /^\s*[-*+\d]|^\s*-\s\[/;

// パターンをオブジェクトとしてエクスポート（後方互換性のため）
export const patterns = {
    HEADING,
    HEADING_WITH_SPACE,
    CHECKBOX,
    CHECKBOX_MARKER,
    CHECKBOX_CHECKED,
    NUMBERED_LIST,
    NUMBERED_LIST_MARKER,
    NUMBERED_LIST_ANY,
    BULLET_LIST,
    BULLET_LIST_MARKER,
    QUOTE,
    QUOTE_MARKER,
    CODE_FENCE,
    CODE_FENCE_START,
    TABLE_SEPARATOR,
    TABLE_LINE,
    HORIZONTAL_RULE,
    ANY_LIST_ITEM
};

// ========== ヘルパー関数 ==========

/**
 * 行のタイプを判定
 */
export function getLineType(line: string): LineType {
    if (CHECKBOX_MARKER.test(line)) return 'checkbox';
    if (NUMBERED_LIST_ANY.test(line)) return 'numbered';
    if (BULLET_LIST_MARKER.test(line)) return 'bullet';
    if (HEADING.test(line)) return 'heading';
    if (QUOTE.test(line)) return 'quote';
    if (CODE_FENCE.test(line)) return 'codeblock';
    if (line.trim() === '') return 'empty';
    return 'text';
}

/**
 * マーカー終了位置を取得
 */
export function getMarkerInfo(text: string): MarkerInfo {
    let contentStart = 0;
    let hasMarker = false;
    let markerType: MarkerInfo['markerType'] = null;

    // ヘッディング
    const headingMatch = text.match(HEADING_WITH_SPACE);
    if (headingMatch) {
        contentStart = headingMatch[1].length;
        hasMarker = true;
        markerType = 'heading';
    }
    // チェックボックス
    else if (CHECKBOX_MARKER.test(text)) {
        const match = text.match(CHECKBOX_MARKER);
        if (match) {
            contentStart = match[1].length;
            hasMarker = true;
            markerType = 'checkbox';
        }
    }
    // 番号付きリスト
    else if (NUMBERED_LIST_MARKER.test(text)) {
        const match = text.match(NUMBERED_LIST_MARKER);
        if (match) {
            contentStart = match[1].length;
            hasMarker = true;
            markerType = 'numbered';
        }
    }
    // 箇条書きリスト
    else if (BULLET_LIST_MARKER.test(text)) {
        const match = text.match(BULLET_LIST_MARKER);
        if (match) {
            contentStart = match[1].length;
            hasMarker = true;
            markerType = 'bullet';
        }
    }
    // 引用
    else if (QUOTE.test(text)) {
        const match = text.match(QUOTE);
        if (match) {
            contentStart = match[0].length;
            hasMarker = true;
            markerType = 'quote';
        }
    }
    // コードブロック
    else if (CODE_FENCE.test(text)) {
        const match = text.match(CODE_FENCE);
        if (match) {
            contentStart = match[1].length;
            hasMarker = true;
            markerType = 'codeblock';
        }
    }

    return { contentStart, hasMarker, markerType };
}

/**
 * 番号付きリストの情報を抽出
 */
export function extractNumberedList(line: string): NumberedListInfo | null {
    const match = line.match(NUMBERED_LIST);
    if (match) {
        return {
            indent: match[1],
            number: parseInt(match[2], 10),
            delimiter: match[3],
            content: match[4]
        };
    }
    return null;
}

/**
 * チェックボックスの情報を抽出
 */
export function extractCheckbox(line: string): CheckboxInfo | null {
    const match = line.match(CHECKBOX);
    if (match) {
        return {
            indent: match[1],
            checked: match[2].toLowerCase() === 'x',
            content: match[3]
        };
    }
    return null;
}

/**
 * 見出しの情報を抽出
 */
export function extractHeading(line: string): HeadingInfo | null {
    const match = line.match(HEADING);
    if (match) {
        return {
            level: match[1].length,
            text: match[2].trim()
        };
    }
    return null;
}

/**
 * リスト項目かどうかを判定
 */
export function isListItem(line: string): boolean {
    return ANY_LIST_ITEM.test(line);
}

/**
 * テーブルのセパレータ行かどうかを判定
 */
export function isSeparatorRow(cells: string[] | null | undefined): boolean {
    if (!cells || cells.length === 0) return false;
    return cells.every(c => TABLE_SEPARATOR.test(c.replace(/\s+/g, '')));
}
