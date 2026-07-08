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

/** `link` マークの現在の href（無ければ空文字）。 */
export function getLinkHref(mark: Mark): string {
    return typeof mark.attrs.href === 'string' ? mark.attrs.href : '';
}

/**
 * フェンスコードブロックの開始行・終了行のマーカー文字列（`` ```lang `` / `` ``` ``）。
 * `code_block` 以外は null。
 */
export function getCodeFenceMarkers(node: ProseNode): { open: string; close: string } | null {
    if (node.type.name !== 'code_block') return null;
    const language = typeof node.attrs.language === 'string' ? node.attrs.language : '';
    return { open: '```' + language, close: '```' };
}

export function findFocusedBlockDepth($pos: ResolvedPos): number | null {
    for (let depth = $pos.depth; depth > 0; depth--) {
        const name = $pos.node(depth).type.name;
        if (name === 'heading' || name === 'paragraph' || name === 'list_item' || name === 'code_block') {
            return depth;
        }
    }
    return null;
}

// ───────────────────────────────────────────
// インライン記法マークのフォーカス時実テキスト編集化
// （`inlineMarkEditPlugin.ts` が使う純ロジック。strong/emphasis/inlineCode/strike_through/link
// の全てが対象。widget 表示のみで実テキスト化しない対象マークはもう無い）
// ───────────────────────────────────────────

/** 実テキスト編集の対象になるインライン記法マーク種。 */
export type EditableInlineMarkType = 'strong' | 'emphasis' | 'inlineCode' | 'strike_through' | 'link';

const EDITABLE_INLINE_MARK_TYPES: readonly EditableInlineMarkType[] = ['strong', 'emphasis', 'inlineCode', 'strike_through', 'link'];

export function isEditableInlineMarkType(name: string): name is EditableInlineMarkType {
    return (EDITABLE_INLINE_MARK_TYPES as readonly string[]).includes(name);
}

/**
 * type ごとのマーカー。`link` は href によって close マーカーが変わるため、
 * 対象の href を渡す（他の種では無視してよい）。
 */
export function getEditableInlineMarkMarker(type: EditableInlineMarkType, href?: string): InlineMarkMarker {
    if (type === 'link') {
        return { open: '[', close: `](${href ?? ''})` };
    }
    if (type === 'inlineCode') return { open: '`', close: '`' };
    if (type === 'strike_through') return { open: '~~', close: '~~' };
    if (type === 'strong') return { open: '**', close: '**' };
    return { open: '*', close: '*' };
}

/** マーク種ごとの実際のマーカー文字（`*` 系は strong/emphasis 共通の `*`）。link には無い（別ロジックで扱う）。 */
function markerCharFor(type: Exclude<EditableInlineMarkType, 'link'>): string {
    if (type === 'inlineCode') return '`';
    if (type === 'strike_through') return '~';
    return '*';
}

/**
 * ある1つのテキストブロック（`block`）のうち、フォーカス対象の editable マーク種が
 * 連続して掛かっている最大範囲を、種別ごとにすべて集める。
 *
 * 同じマーク種が複数の隣接テキストノードにまたがる場合（例: `**bold *and* bold**` の
 * ように strong の途中に emphasis が重なる区間がある）でも、strong の連続区間としては
 * 1つの範囲にまとめる（ノードごとに `**` を重複挿入しない）。
 *
 * `blockStart` はブロック内容の先頭の絶対位置（呼び出し側で `$pos.start(depth)` 等から
 * 渡す）。
 */
export function collectEditableInlineMarkRanges(
    block: ProseNode,
    blockStart: number
): Array<{ from: number; to: number; type: EditableInlineMarkType; href?: string }> {
    const ranges: Array<{ from: number; to: number; type: EditableInlineMarkType; href?: string }> = [];

    for (const type of EDITABLE_INLINE_MARK_TYPES) {
        let runStart: number | null = null;
        let runEnd = 0;
        let runHref: string | undefined;
        let offset = 0;

        const flush = (): void => {
            if (runStart !== null) {
                ranges.push({ from: runStart, to: runEnd, type, href: runHref });
                runStart = null;
                runHref = undefined;
            }
        };

        block.forEach((child) => {
            const childFrom = blockStart + offset;
            const childLen = child.nodeSize;
            const mark = child.isText ? child.marks.find(m => m.type.name === type) : undefined;
            // link は href が異なれば別リンクなので、同じ連続区間としてまとめない
            // （例: `[a](u1)[b](u2)` が間に非リンク文字を挟まず隣接するケース）。
            const href = mark && type === 'link' ? getLinkHref(mark) : undefined;
            const continuesRun = runStart !== null && (type !== 'link' || href === runHref);
            if (mark && continuesRun) {
                runEnd = childFrom + childLen;
            } else if (mark) {
                flush();
                runStart = childFrom;
                runEnd = childFrom + childLen;
                runHref = href;
            } else {
                flush();
            }
            offset += childLen;
        });
        flush();
    }

    // 展開時にドキュメント末尾側から処理できるよう、開始位置の降順に並べる。
    ranges.sort((a, b) => b.from - a.from);
    return ranges;
}

/** text の先頭から、type のマーカー文字が連続する数（最大 maxLen）。link には使わない。 */
export function countLeadingMarkerChars(text: string, type: Exclude<EditableInlineMarkType, 'link'>, maxLen: number): number {
    const ch = markerCharFor(type);
    let n = 0;
    while (n < maxLen && n < text.length && text[n] === ch) n++;
    return n;
}

/** text の末尾から、type のマーカー文字が連続する数（最大 maxLen）。link には使わない。 */
export function countTrailingMarkerChars(text: string, type: Exclude<EditableInlineMarkType, 'link'>, maxLen: number): number {
    const ch = markerCharFor(type);
    let n = 0;
    while (n < maxLen && n < text.length && text[text.length - 1 - n] === ch) n++;
    return n;
}

/**
 * collapse 時、開き側・閉じ側それぞれに残っているマーカー文字数（survived）から、
 * 最終的に適用すべきマーク種を決定する（無ければ null）。
 *
 * 左右非対称な編集（例: 閉じ側だけ1文字 Backspace で消す）をしても、弱い方（少ない方）に
 * 揃える。`*` 系（strong/emphasis）は 2文字以上で strong、1文字で emphasis、0文字で
 * マーク無し。`` ` ``（inlineCode）・`~`（strike_through）は1文字以上で維持、0文字で
 * マーク無し（これらは「濃淡」の中間形が無いため）。
 */
export function resolveInlineMarkAfterEdit(
    originalType: Exclude<EditableInlineMarkType, 'link'>,
    openSurvived: number,
    closeSurvived: number
): Exclude<EditableInlineMarkType, 'link'> | null {
    const count = Math.min(openSurvived, closeSurvived);
    if (originalType === 'strong' || originalType === 'emphasis') {
        if (count >= 2) return 'strong';
        if (count === 1) return 'emphasis';
        return null;
    }
    return count >= 1 ? originalType : null;
}

/** link の開き側テキストが編集されずそのまま残っているか（ちょうど `[`）。 */
export function isLinkOpenMarkerIntact(openText: string): boolean {
    return openText === '[';
}

/** link の閉じ側テキストが `](href)` 形式か判定し、href を返す（不一致なら null）。 */
export function parseLinkCloseMarkerHref(closeText: string): string | null {
    const match = /^\]\((.*)\)$/.exec(closeText);
    return match ? match[1] : null;
}

/**
 * link の collapse 判定。開き側テキストがちょうど `[`、閉じ側テキストが
 * `](href)` 形式にマッチする場合のみ link を維持し、href を閉じ側テキストから
 * 読み取った値で更新する。どちらか一方でも壊れていれば link マークを除去する
 * （`inline-mark-focus-edit-fix.md` §2「link の collapse 判定」）。
 */
export function resolveLinkAfterEdit(openText: string, closeText: string): { href: string } | null {
    if (!isLinkOpenMarkerIntact(openText)) return null;
    const href = parseLinkCloseMarkerHref(closeText);
    return href !== null ? { href } : null;
}
