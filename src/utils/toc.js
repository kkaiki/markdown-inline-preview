"use strict";
/**
 * 目次（Table of Contents）ユーティリティ
 * 見出し収集、スラッグ生成、目次生成関連の関数
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateSlug = generateSlug;
exports.collectHeadings = collectHeadings;
exports.collectHeadingsFromText = collectHeadingsFromText;
exports.generateTableOfContents = generateTableOfContents;
exports.findTocMarker = findTocMarker;
exports.findTocSection = findTocSection;
const patterns_1 = require("./patterns");
/**
 * 見出しテキストからアンカーリンク用のスラッグを生成
 */
function generateSlug(text) {
    return text
        .toLowerCase()
        .replace(/[^\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\s-]/g, '') // 日本語と英数字を保持
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();
}
/**
 * ドキュメント内の見出しを収集
 */
function collectHeadings(document) {
    const headings = [];
    let inCodeBlock = false;
    for (let i = 0; i < document.lineCount; i++) {
        const lineText = document.lineAt(i).text;
        // コードブロック内は無視
        if (lineText.trim().startsWith('```')) {
            inCodeBlock = !inCodeBlock;
            continue;
        }
        if (inCodeBlock)
            continue;
        // 見出しを検出
        const heading = (0, patterns_1.extractHeading)(lineText);
        if (heading) {
            headings.push({ ...heading, line: i });
        }
    }
    return headings;
}
/**
 * テキストから見出しを収集（ドキュメントオブジェクトなしで使用）
 */
function collectHeadingsFromText(text) {
    const lines = text.split('\n');
    const headings = [];
    let inCodeBlock = false;
    for (let i = 0; i < lines.length; i++) {
        const lineText = lines[i];
        if (lineText.trim().startsWith('```')) {
            inCodeBlock = !inCodeBlock;
            continue;
        }
        if (inCodeBlock)
            continue;
        const heading = (0, patterns_1.extractHeading)(lineText);
        if (heading) {
            headings.push({ ...heading, line: i });
        }
    }
    return headings;
}
/**
 * 目次テキストを生成
 */
function generateTableOfContents(headings, minLevel = 1, maxLevel = 6) {
    if (headings.length === 0) {
        return '';
    }
    const lines = [];
    const filteredHeadings = headings.filter(h => h.level >= minLevel && h.level <= maxLevel);
    if (filteredHeadings.length === 0) {
        return '';
    }
    const baseLevel = Math.min(...filteredHeadings.map(h => h.level));
    for (const heading of filteredHeadings) {
        const indent = '  '.repeat(heading.level - baseLevel);
        const slug = generateSlug(heading.text);
        lines.push(`${indent}- [${heading.text}](#${slug})`);
    }
    return lines.join('\n');
}
/**
 * 目次マーカーを検出
 */
function findTocMarker(text) {
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes('/目次') || line.includes('/toc')) {
            return {
                hasMarker: true,
                markerType: line.includes('/目次') ? 'japanese' : 'english',
                line: i
            };
        }
    }
    return { hasMarker: false, markerType: null, line: -1 };
}
/**
 * 目次セクションの範囲を検出
 */
function findTocSection(document) {
    let tocStart = -1;
    let tocEnd = -1;
    for (let i = 0; i < document.lineCount; i++) {
        const line = document.lineAt(i).text;
        if (line.includes('/目次') || line.includes('/toc')) {
            tocStart = i;
            continue;
        }
        if (tocStart >= 0) {
            if (line.includes('/end-目次') || line.includes('/end-toc')) {
                tocEnd = i;
                break;
            }
        }
    }
    if (tocStart >= 0 && tocEnd > tocStart) {
        return { start: tocStart, end: tocEnd };
    }
    return null;
}
//# sourceMappingURL=toc.js.map