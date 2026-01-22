"use strict";
/**
 * リスト操作ユーティリティ
 * 番号付きリスト、箇条書き、チェックボックスの操作関連関数
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractCheckbox = exports.extractNumberedList = exports.isListItem = void 0;
exports.getIndentString = getIndentString;
exports.getIndentLevel = getIndentLevel;
exports.createIndent = createIndent;
exports.getListType = getListType;
exports.convertLineToType = convertLineToType;
exports.getNextListNumber = getNextListNumber;
exports.toggleCheckboxState = toggleCheckboxState;
exports.calculateBlockRange = calculateBlockRange;
exports.getListContinuationMarker = getListContinuationMarker;
const patterns_1 = require("./patterns");
Object.defineProperty(exports, "extractNumberedList", { enumerable: true, get: function () { return patterns_1.extractNumberedList; } });
Object.defineProperty(exports, "extractCheckbox", { enumerable: true, get: function () { return patterns_1.extractCheckbox; } });
Object.defineProperty(exports, "isListItem", { enumerable: true, get: function () { return patterns_1.isListItem; } });
/**
 * インデント文字列を取得
 */
function getIndentString(line) {
    const match = line.match(/^(\s*)/);
    return match ? match[1] : '';
}
/**
 * インデントレベルを計算
 * タブは1レベル、スペースは2つで1レベル
 */
function getIndentLevel(indentStr) {
    if (!indentStr)
        return 0;
    const tabs = (indentStr.match(/\t/g) || []).length;
    const spaces = (indentStr.match(/ /g) || []).length;
    return tabs + Math.ceil(spaces / 2);
}
/**
 * 指定レベルのインデント文字列を生成
 */
function createIndent(level, useTabs = false) {
    if (useTabs) {
        return '\t'.repeat(level);
    }
    return '  '.repeat(level);
}
/**
 * 行のリストタイプを判定
 */
function getListType(line) {
    if (patterns_1.patterns.CHECKBOX.test(line))
        return 'checkbox';
    if (patterns_1.patterns.NUMBERED_LIST.test(line))
        return 'numbered';
    if (patterns_1.patterns.BULLET_LIST.test(line))
        return 'bullet';
    return null;
}
/**
 * 行をリストタイプに変換
 */
function convertLineToType(line, targetType) {
    // 引用マーカー（> ）を抽出
    let quotePrefix = '';
    let restOfLine = line;
    const quoteMatch = line.match(/^((?:>\s*)+)/);
    if (quoteMatch) {
        quotePrefix = quoteMatch[1];
        restOfLine = line.substring(quotePrefix.length);
    }
    // 現在の行のインデントとコンテンツを抽出
    let indent = '';
    let content = '';
    let match;
    if ((match = restOfLine.match(/^(\s*)-\s\[[xX ]?\]\s+(.*)$/))) {
        indent = match[1];
        content = match[2];
    }
    else if ((match = restOfLine.match(/^(\s*)[-*+]\s+(.*)$/))) {
        indent = match[1];
        content = match[2];
    }
    else if ((match = restOfLine.match(/^(\s*)\d+[\.)]\s+(.*)$/))) {
        indent = match[1];
        content = match[2];
    }
    else if ((match = restOfLine.match(/^(\s*)(.*)$/))) {
        indent = match[1];
        content = match[2];
    }
    else {
        return line;
    }
    switch (targetType) {
        case 'bullet':
            return `${quotePrefix}${indent}- ${content}`;
        case 'numbered':
            return `${quotePrefix}${indent}1. ${content}`;
        case 'checkbox':
            return `${quotePrefix}${indent}- [ ] ${content}`;
        case 'normal':
            return `${quotePrefix}${indent}${content}`;
        default:
            return line;
    }
}
/**
 * 番号付きリストの次の番号を生成
 */
function getNextListNumber(currentNumber, delimiter = '.') {
    return `${currentNumber + 1}${delimiter} `;
}
/**
 * チェックボックスの状態をトグル
 */
function toggleCheckboxState(line) {
    const checkbox = (0, patterns_1.extractCheckbox)(line);
    if (!checkbox)
        return line;
    if (checkbox.checked) {
        return line.replace(/\[x\]/i, '[ ]');
    }
    else {
        return line.replace(/\[ \]/, '[x]');
    }
}
/**
 * ブロック（子要素を含む）の範囲を計算
 */
function calculateBlockRange(lines, startLine) {
    const currentIndent = getIndentString(lines[startLine]).length;
    let blockEndLine = startLine;
    for (let i = startLine + 1; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim() === '')
            break;
        const indent = getIndentString(line).length;
        if (indent <= currentIndent)
            break;
        blockEndLine = i;
    }
    return { start: startLine, end: blockEndLine };
}
/**
 * リスト継続のマーカーを生成
 */
function getListContinuationMarker(line) {
    const markerInfo = (0, patterns_1.getMarkerInfo)(line);
    if (!markerInfo.hasMarker)
        return null;
    const indent = getIndentString(line);
    switch (markerInfo.markerType) {
        case 'checkbox':
            return `${indent}- [ ] `;
        case 'numbered': {
            const numbered = (0, patterns_1.extractNumberedList)(line);
            if (numbered) {
                return `${indent}${numbered.number + 1}${numbered.delimiter} `;
            }
            return `${indent}1. `;
        }
        case 'bullet': {
            const bulletMatch = line.match(/^(\s*)([-*+])\s/);
            if (bulletMatch) {
                return `${indent}${bulletMatch[2]} `;
            }
            return `${indent}- `;
        }
        case 'quote':
            return `${indent}> `;
        default:
            return null;
    }
}
//# sourceMappingURL=list.js.map