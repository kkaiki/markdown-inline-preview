import type { HeadingInfo } from '../../types';
import { generateSlug } from '../markdown/slug';
import { collectHeadings } from './toc';

export interface ScrollAnchor {
    line: number;
    slug: string;
    title: string;
}

/** 見出しテキストからスクロールアンカーペイロードを生成 */
export function createScrollAnchor(title: string, line = 0): ScrollAnchor {
    const trimmed = title.trim();
    return {
        line,
        slug: generateSlug(trimmed),
        title: trimmed
    };
}

/** DOM 見出しテキストがアンカーと一致するか（slug またはタイトル完全一致） */
export function headingMatchesScrollAnchor(
    headingText: string,
    anchor: Pick<ScrollAnchor, 'slug' | 'title'>
): boolean {
    const text = headingText.trim();
    return generateSlug(text) === anchor.slug || text === anchor.title;
}

interface DocumentLike {
    lineCount: number;
    lineAt(line: number): { text: string };
}

/** 指定行より上で最も近い見出しをスクロールアンカーとして返す */
export function findScrollAnchor(document: DocumentLike, line: number): ScrollAnchor | undefined {
    const headings = collectHeadings(document).filter(
        (heading): heading is HeadingInfo & { line: number } => heading.line !== undefined
    );
    if (headings.length === 0) return undefined;

    const clamped = Math.max(0, Math.min(line, document.lineCount - 1));
    let anchor = headings[0];
    for (const heading of headings) {
        if (heading.line < clamped) anchor = heading;
        else break;
    }

    return createScrollAnchor(anchor.text, anchor.line);
}

export function findLineBySlug(document: DocumentLike, slug: string): number | undefined {
    for (const heading of collectHeadings(document)) {
        if (heading.line !== undefined && generateSlug(heading.text) === slug) return heading.line;
    }
    return undefined;
}
