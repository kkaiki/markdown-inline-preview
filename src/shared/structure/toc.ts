/**
 * 目次（Table of Contents）ユーティリティ
 * 見出し収集、スラッグ生成、目次生成関連の関数
 */

import type { HeadingInfo, TocMarkerInfo, TocSection } from '../../types';
import { extractHeading } from '../markdown/patterns';
import { generateSlug } from '../markdown/slug';

// VS Code document interface (minimal)
interface DocumentLike {
    lineCount: number;
    lineAt(line: number): { text: string };
}

/**
 * ドキュメント内の見出しを収集
 */
export function collectHeadings(document: DocumentLike): HeadingInfo[] {
    const headings: HeadingInfo[] = [];
    let inCodeBlock = false;

    for (let i = 0; i < document.lineCount; i++) {
        const lineText = document.lineAt(i).text;

        // コードブロック内は無視
        if (lineText.trim().startsWith('```')) {
            inCodeBlock = !inCodeBlock;
            continue;
        }
        if (inCodeBlock) continue;

        // 見出しを検出
        const heading = extractHeading(lineText);
        if (heading) {
            headings.push({ ...heading, line: i });
        }
    }

    return headings;
}

/**
 * テキストから見出しを収集（ドキュメントオブジェクトなしで使用）
 */
export function collectHeadingsFromText(text: string): HeadingInfo[] {
    const lines = text.split('\n');
    const headings: HeadingInfo[] = [];
    let inCodeBlock = false;

    for (let i = 0; i < lines.length; i++) {
        const lineText = lines[i];

        if (lineText.trim().startsWith('```')) {
            inCodeBlock = !inCodeBlock;
            continue;
        }
        if (inCodeBlock) continue;

        const heading = extractHeading(lineText);
        if (heading) {
            headings.push({ ...heading, line: i });
        }
    }

    return headings;
}

/**
 * 目次テキストを生成
 */
export function generateTableOfContents(
    headings: HeadingInfo[],
    minLevel: number = 1,
    maxLevel: number = 6
): string {
    if (headings.length === 0) {
        return '';
    }

    const lines: string[] = [];
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
export function findTocMarker(text: string): TocMarkerInfo {
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
export function findTocSection(document: DocumentLike): TocSection | null {
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
