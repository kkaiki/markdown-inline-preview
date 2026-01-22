"use strict";
/**
 * Markdown要素の正規表現パターン定義
 * 全てのパターンはここで一元管理
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.patterns = exports.ANY_LIST_ITEM = exports.HORIZONTAL_RULE = exports.TABLE_LINE = exports.TABLE_SEPARATOR = exports.CODE_FENCE_START = exports.CODE_FENCE = exports.QUOTE_MARKER = exports.QUOTE = exports.BULLET_LIST_MARKER = exports.BULLET_LIST = exports.NUMBERED_LIST_ANY = exports.NUMBERED_LIST_MARKER = exports.NUMBERED_LIST = exports.CHECKBOX_CHECKED = exports.CHECKBOX_MARKER = exports.CHECKBOX = exports.HEADING_WITH_SPACE = exports.HEADING = void 0;
exports.getLineType = getLineType;
exports.getMarkerInfo = getMarkerInfo;
exports.extractNumberedList = extractNumberedList;
exports.extractCheckbox = extractCheckbox;
exports.extractHeading = extractHeading;
exports.isListItem = isListItem;
exports.isSeparatorRow = isSeparatorRow;
// ========== 正規表現パターン定義 ==========
// 見出し
exports.HEADING = /^(#{1,6})\s+(.*)$/;
exports.HEADING_WITH_SPACE = /^(#{1,6}\s+)/;
// チェックボックス
exports.CHECKBOX = /^(\s*)-\s\[([xX ]?)\]\s*(.*)/;
exports.CHECKBOX_MARKER = /^(\s*-\s\[[\sx]?\]\s*)/i;
exports.CHECKBOX_CHECKED = /^\s*-\s\[[xX]\]\s*/;
// 番号付きリスト
exports.NUMBERED_LIST = /^(\s*)(\d+)([\.)])\s*(.*)/;
exports.NUMBERED_LIST_MARKER = /^(\s*\d+\.\s+)/;
exports.NUMBERED_LIST_ANY = /^(\s*)(\d+)([\.)])\s*/;
// 箇条書きリスト
exports.BULLET_LIST = /^(\s*)([-*+])\s+(.*)/;
exports.BULLET_LIST_MARKER = /^(\s*[-*+]\s+)/;
// 引用
exports.QUOTE = /^(>\s*)+/;
exports.QUOTE_MARKER = /^(>\s*)+/;
// コードブロック
exports.CODE_FENCE = /^(```\w*\s*)/;
exports.CODE_FENCE_START = /^```(\w*)?$/;
// テーブル
exports.TABLE_SEPARATOR = /^:?-+:?$/;
exports.TABLE_LINE = /\|/;
// 水平線
exports.HORIZONTAL_RULE = /^(\s*)([-*_])\2{2,}\s*$/;
// リスト判定（包括的）
exports.ANY_LIST_ITEM = /^\s*[-*+\d]|^\s*-\s\[/;
// パターンをオブジェクトとしてエクスポート（後方互換性のため）
exports.patterns = {
    HEADING: exports.HEADING,
    HEADING_WITH_SPACE: exports.HEADING_WITH_SPACE,
    CHECKBOX: exports.CHECKBOX,
    CHECKBOX_MARKER: exports.CHECKBOX_MARKER,
    CHECKBOX_CHECKED: exports.CHECKBOX_CHECKED,
    NUMBERED_LIST: exports.NUMBERED_LIST,
    NUMBERED_LIST_MARKER: exports.NUMBERED_LIST_MARKER,
    NUMBERED_LIST_ANY: exports.NUMBERED_LIST_ANY,
    BULLET_LIST: exports.BULLET_LIST,
    BULLET_LIST_MARKER: exports.BULLET_LIST_MARKER,
    QUOTE: exports.QUOTE,
    QUOTE_MARKER: exports.QUOTE_MARKER,
    CODE_FENCE: exports.CODE_FENCE,
    CODE_FENCE_START: exports.CODE_FENCE_START,
    TABLE_SEPARATOR: exports.TABLE_SEPARATOR,
    TABLE_LINE: exports.TABLE_LINE,
    HORIZONTAL_RULE: exports.HORIZONTAL_RULE,
    ANY_LIST_ITEM: exports.ANY_LIST_ITEM
};
// ========== ヘルパー関数 ==========
/**
 * 行のタイプを判定
 */
function getLineType(line) {
    if (exports.CHECKBOX_MARKER.test(line))
        return 'checkbox';
    if (exports.NUMBERED_LIST_ANY.test(line))
        return 'numbered';
    if (exports.BULLET_LIST_MARKER.test(line))
        return 'bullet';
    if (exports.HEADING.test(line))
        return 'heading';
    if (exports.QUOTE.test(line))
        return 'quote';
    if (exports.CODE_FENCE.test(line))
        return 'codeblock';
    if (line.trim() === '')
        return 'empty';
    return 'text';
}
/**
 * マーカー終了位置を取得
 */
function getMarkerInfo(text) {
    let contentStart = 0;
    let hasMarker = false;
    let markerType = null;
    // ヘッディング
    const headingMatch = text.match(exports.HEADING_WITH_SPACE);
    if (headingMatch) {
        contentStart = headingMatch[1].length;
        hasMarker = true;
        markerType = 'heading';
    }
    // チェックボックス
    else if (exports.CHECKBOX_MARKER.test(text)) {
        const match = text.match(exports.CHECKBOX_MARKER);
        if (match) {
            contentStart = match[1].length;
            hasMarker = true;
            markerType = 'checkbox';
        }
    }
    // 番号付きリスト
    else if (exports.NUMBERED_LIST_MARKER.test(text)) {
        const match = text.match(exports.NUMBERED_LIST_MARKER);
        if (match) {
            contentStart = match[1].length;
            hasMarker = true;
            markerType = 'numbered';
        }
    }
    // 箇条書きリスト
    else if (exports.BULLET_LIST_MARKER.test(text)) {
        const match = text.match(exports.BULLET_LIST_MARKER);
        if (match) {
            contentStart = match[1].length;
            hasMarker = true;
            markerType = 'bullet';
        }
    }
    // 引用
    else if (exports.QUOTE.test(text)) {
        const match = text.match(exports.QUOTE);
        if (match) {
            contentStart = match[0].length;
            hasMarker = true;
            markerType = 'quote';
        }
    }
    // コードブロック
    else if (exports.CODE_FENCE.test(text)) {
        const match = text.match(exports.CODE_FENCE);
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
function extractNumberedList(line) {
    const match = line.match(exports.NUMBERED_LIST);
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
function extractCheckbox(line) {
    const match = line.match(exports.CHECKBOX);
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
function extractHeading(line) {
    const match = line.match(exports.HEADING);
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
function isListItem(line) {
    return exports.ANY_LIST_ITEM.test(line);
}
/**
 * テーブルのセパレータ行かどうかを判定
 */
function isSeparatorRow(cells) {
    if (!cells || cells.length === 0)
        return false;
    return cells.every(c => exports.TABLE_SEPARATOR.test(c.replace(/\s+/g, '')));
}
//# sourceMappingURL=patterns.js.map