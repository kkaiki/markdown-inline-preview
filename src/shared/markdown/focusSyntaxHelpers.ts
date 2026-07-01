import type { Mark, Node as ProseNode, ResolvedPos } from '@milkdown/prose/model';

export interface InlineMarkMarker {
    open: string;
    close: string;
}

const INLINE_MARK_MARKERS: Record<string, (mark: Mark) => InlineMarkMarker> = {
    strong: () => ({ open: '**', close: '**' }),
    emphasis: () => ({ open: '*', close: '*' }),
    inlineCode: () => ({ open: '`', close: '`' }),
    strike_through: () => ({ open: '~~', close: '~~' }),
    link: (mark) => {
        const href = typeof mark.attrs.href === 'string' ? mark.attrs.href : '';
        return { open: '[', close: `](${href})` };
    }
};

export function getHeadingPrefix(level: number): string {
    const safe = Math.min(6, Math.max(1, Math.floor(level) || 1));
    return `${'#'.repeat(safe)} `;
}

export function getListItemPrefix($pos: ResolvedPos, listItemDepth: number): string | null {
    const listItem = $pos.node(listItemDepth);
    if (listItem.type.name !== 'list_item') return null;

    // チェックボックス（タスク項目）はフォーカス時もマーカー（`- [x]`）を出さない。
    // これで md-focus-list クラスが付かず、クリック可能なチェックボックス UI が隠れない
    // （= フォーカス中でもクリックでトグルできる）。チェックボックスの解除は Backspace
    // （markerBackspace）、チェック切替は クリック / Cmd+Enter で行う。
    if (listItem.attrs.checked === true || listItem.attrs.checked === false) return null;

    const parent = $pos.node(listItemDepth - 1);
    if (parent.type.name === 'ordered_list') {
        return `${$pos.index(listItemDepth - 1) + 1}. `;
    }
    if (parent.type.name === 'bullet_list') {
        return '- ';
    }
    return null;
}

export function getBlockquotePrefix($pos: ResolvedPos, depth: number): string | null {
    const node = $pos.node(depth);
    if (node.type.name !== 'paragraph') return null;
    if (depth > 0 && $pos.node(depth - 1).type.name === 'blockquote') {
        return '> ';
    }
    return null;
}

export function getBlockPrefix($pos: ResolvedPos, depth: number): string | null {
    const node = $pos.node(depth);
    if (node.type.name === 'heading') {
        return getHeadingPrefix(node.attrs.level as number);
    }
    if (node.type.name === 'list_item') {
        return getListItemPrefix($pos, depth);
    }
    // findFocusedBlockDepth() resolves to the innermost paragraph, which for a list
    // item is one level below the list_item node itself - check there too.
    if (depth > 0 && $pos.node(depth - 1).type.name === 'list_item') {
        return getListItemPrefix($pos, depth - 1);
    }
    return getBlockquotePrefix($pos, depth);
}

export function getInlineMarkMarker(mark: Mark): InlineMarkMarker | null {
    const factory = INLINE_MARK_MARKERS[mark.type.name];
    return factory ? factory(mark) : null;
}

export function findFocusedBlockDepth($pos: ResolvedPos): number | null {
    for (let depth = $pos.depth; depth > 0; depth--) {
        const name = $pos.node(depth).type.name;
        if (name === 'heading' || name === 'paragraph' || name === 'list_item') {
            return depth;
        }
    }
    return null;
}

export function collectInlineMarksInRange(doc: ProseNode, from: number, to: number): Array<{ pos: number; end: number; marker: InlineMarkMarker }> {
    const results: Array<{ pos: number; end: number; marker: InlineMarkMarker }> = [];

    doc.nodesBetween(from, to, (node, pos) => {
        if (!node.isText) return;
        const textLen = node.text?.length ?? 0;
        const nodeFrom = pos;
        const nodeTo = pos + textLen;

        for (const mark of node.marks) {
            const marker = getInlineMarkMarker(mark);
            if (!marker) continue;
            results.push({ pos: nodeFrom, end: nodeTo, marker });
        }
    });

    return results;
}
