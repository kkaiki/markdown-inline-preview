/**
 * 見出し収集ユーティリティ（スクロールアンカー等で使用）
 */

import type { HeadingInfo } from '../../types';
import { extractHeading } from '../markdown/patterns';

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
