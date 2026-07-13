/**
 * リスト操作ユーティリティ
 * 番号付きリスト、箇条書き、チェックボックスの操作関連関数
 */

import type { ListType, ConvertType, BlockRange } from '../../types';
import { patterns, extractNumberedList, extractCheckbox, isListItem, getMarkerInfo } from '../markdown/patterns';

/**
 * インデント文字列を取得
 */
export function getIndentString(line: string): string {
    const match = line.match(/^(\s*)/);
    return match ? match[1] : '';
}

/**
 * インデントレベルを計算
 * タブは1レベル、スペースは2つで1レベル
 */
export function getIndentLevel(indentStr: string): number {
    if (!indentStr) return 0;

    const tabs = (indentStr.match(/\t/g) ?? []).length;
    const spaces = (indentStr.match(/ /g) ?? []).length;

    return tabs + Math.ceil(spaces / 2);
}

/**
 * 指定レベルのインデント文字列を生成
 */
export function createIndent(level: number, useTabs: boolean = false): string {
    if (useTabs) {
        return '\t'.repeat(level);
    }
    return '  '.repeat(level);
}

/**
 * 行のリストタイプを判定
 */
export function getListType(line: string): ListType {
    if (patterns.CHECKBOX.test(line)) return 'checkbox';
    if (patterns.NUMBERED_LIST.test(line)) return 'numbered';
    if (patterns.BULLET_LIST.test(line)) return 'bullet';
    return null;
}

/**
 * 行をリストタイプに変換
 */
export function convertLineToType(line: string, targetType: ConvertType): string {
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
    let match: RegExpMatchArray | null;

    if ((match = restOfLine.match(/^(\s*)-\s\[[xX ]?\]\s+(.*)$/))) {
        indent = match[1];
        content = match[2];
    } else if ((match = restOfLine.match(/^(\s*)[-*+]\s+(.*)$/))) {
        indent = match[1];
        content = match[2];
    } else if ((match = restOfLine.match(/^(\s*)\d+[\.)]\s+(.*)$/))) {
        indent = match[1];
        content = match[2];
    } else if ((match = restOfLine.match(/^(\s*)#{1,6}\s+(.*)$/))) {
        // 既存の見出し → 中身だけ取り出す（他タイプへ変換できるように）
        indent = match[1];
        content = match[2];
    } else if ((match = restOfLine.match(/^(\s*)(.*)$/))) {
        indent = match[1];
        content = match[2];
    } else {
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
        case 'heading1':
            return `${quotePrefix}${indent}# ${content}`;
        case 'heading2':
            return `${quotePrefix}${indent}## ${content}`;
        case 'heading3':
            return `${quotePrefix}${indent}### ${content}`;
        default:
            return line;
    }
}

/**
 * 番号付きリストの次の番号を生成
 */
export function getNextListNumber(currentNumber: number, delimiter: string = '.'): string {
    return `${currentNumber + 1}${delimiter} `;
}

/**
 * チェックボックスの状態をトグル
 */
export function toggleCheckboxState(line: string): string {
    const checkbox = extractCheckbox(line);
    if (!checkbox) return line;

    if (checkbox.checked) {
        return line.replace(/\[x\]/i, '[ ]');
    } else {
        return line.replace(/\[ \]/, '[x]');
    }
}

/**
 * ブロック（子要素を含む）の範囲を計算
 */
export function calculateBlockRange(lines: string[], startLine: number): BlockRange {
    const currentIndent = getIndentString(lines[startLine]).length;
    let blockEndLine = startLine;

    for (let i = startLine + 1; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim() === '') break;
        const indent = getIndentString(line).length;
        if (indent <= currentIndent) break;
        blockEndLine = i;
    }

    return { start: startLine, end: blockEndLine };
}

/**
 * リスト継続のマーカーを生成
 */
export function getListContinuationMarker(line: string): string | null {
    const markerInfo = getMarkerInfo(line);
    if (!markerInfo.hasMarker) return null;

    const indent = getIndentString(line);

    switch (markerInfo.markerType) {
        case 'checkbox':
            return `${indent}- [ ] `;
        case 'numbered': {
            const numbered = extractNumberedList(line);
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
        case 'heading':
        case 'codeblock':
        case null:
            // 見出し・コードブロックはリスト継続の対象にならない。
            return null;
    }
}

// Re-export for convenience
export { isListItem, extractNumberedList, extractCheckbox };
