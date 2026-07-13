/**
 * インライン記法マーク（`**太字**` `*斜体*` `~~取り消し線~~` `` `コード` `` `[link](url)`）の
 * フォーカス時「実テキスト編集化」プラグイン。`blockPrefixEditPlugin`（見出し等の行頭
 * プレフィックス）と対になる、インライン版。
 *
 * カーソルが対象マークを含むテキストブロックに入ると、そのブロック内にある対象マーク
 * （strong / emphasis / inlineCode / strike_through / link）の範囲すべてに、開き・閉じ
 * マーカーを**実テキスト**として挿入する。フォーカスがブロックから抜けたら、各範囲の
 * 現在のマーカー文字を読み取り、マークを再構築してからマーカー文字を削除する。
 *
 * ### 設計上の注意
 * - 複数範囲の挿入/削除は 1 つの `tr` の中で行い、各範囲の最終位置は `tr.mapping`
 *   （全ステップ適用後の累積マッピング）で計算する。処理順に依存しないため、範囲の
 *   前後関係や重なりを気にせず安全に扱える。
 * - `addToHistory: false` — undo 履歴を汚さない（`blockPrefixEditPlugin` と同じ方針）。
 * - `focusSyntaxPlugin` の対象マークの widget 表示は展開中はスキップする
 *   （`isInlineMarkEditActive()` を参照）。
 * - `inlineMarkBackspace`（マーク境界での即時マーク解除）は、展開中の範囲内では
 *   スキップし、素の文字削除に委ねる（`isPositionInsideExpandedMarker()` を参照）。
 * - `link` は閉じマーカー `](href)` が可変長（他の3種は固定長の繰り返し文字）なので、
 *   `openMarkerStart`/`closeMarkerEnd`（展開領域の外側境界）も追跡し、collapse 時に
 *   `doc.textBetween` で実テキストをそのまま読み取る
 *   （`docs/specifications/inline-mark-focus-edit-fix.md` §2「link の collapse 判定」）。
 */
import { Plugin, PluginKey, TextSelection } from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';
import { $prose } from '@milkdown/utils';

import {
    findFocusedBlockDepth,
    collectEditableInlineMarkRanges,
    getEditableInlineMarkMarker,
    countLeadingMarkerChars,
    countTrailingMarkerChars,
    resolveInlineMarkAfterEdit,
    isLinkOpenMarkerIntact,
    parseLinkCloseMarkerHref,
    type EditableInlineMarkType
} from '../../shared/markdown/focusSyntaxHelpers';

const PLUGIN_META = 'inlineMarkEdit';

interface ExpandedMarkRange {
    type: EditableInlineMarkType;
    /** 開きマーカー挿入直後 = 元コンテンツの開始位置。 */
    contentStart: number;
    /** 閉じマーカー挿入直前 = 元コンテンツの終了位置。 */
    contentEnd: number;
    openLen: number;
    closeLen: number;
    /** link のみ: 展開領域の外側境界（開きマーカーの直前）。 */
    openMarkerStart?: number;
    /** link のみ: 展開領域の外側境界（閉じマーカーの直後）。 */
    closeMarkerEnd?: number;
    /** link のみ: 展開前の href（変化なし判定・余計な change 抑制に使う）。 */
    originalHref?: string;
}

/** 現在展開中のブロックの識別位置（ブロックノードの直前位置）。null = 展開なし。 */
let expandedBlockPos: number | null = null;
let expandedMarks: ExpandedMarkRange[] = [];

export function isInlineMarkEditActive(): boolean {
    return expandedBlockPos !== null;
}

function getFocusedInlineMarkBlock(view: EditorView): { blockPos: number; blockStart: number; ranges: Array<{ from: number; to: number; type: EditableInlineMarkType; href?: string }> } | null {
    const { state } = view;
    const { $from, $to } = state.selection;
    const depth = findFocusedBlockDepth($from);
    if (depth === null) return null;

    if (!state.selection.empty) {
        // 選択中でも、選択の両端が同一ブロック内に収まっているなら引き続き
        // フォーカス中とみなし展開を維持する（複数ブロックにまたがる選択のみ収縮させる）。
        const toDepth = findFocusedBlockDepth($to);
        if (toDepth === null || $to.before(toDepth) !== $from.before(depth)) return null;
    }

    const node = $from.node(depth);
    if (node.type.name === 'code_block') return null; // コードフェンスは別プラグインの対象

    const blockPos = $from.before(depth);
    const blockStart = $from.start(depth);
    const ranges = collectEditableInlineMarkRanges(node, blockStart);
    return { blockPos, blockStart, ranges };
}

function expandBlock(view: EditorView, ranges: Array<{ from: number; to: number; type: EditableInlineMarkType; href?: string }>): ExpandedMarkRange[] {
    if (ranges.length === 0) return [];
    const { state } = view;
    // カーソル位置を明示的に保存し、挿入後も同じ「実コンテンツ上の位置」に留まるよう
    // 自前でマッピングする。ProseMirror の既定の selection マッピングに任せると、
    // カーソルがちょうど挿入位置（= 閉じマーカーの挿入位置）と一致する場合に
    // 「挿入した内容の直後」へ弾き飛ばされてしまう（bias が既定で +1 のため）。
    // 例えば「bold」の直後にカーソルがある状態でその閉じマーカーを挿入すると、
    // 既定のままではカーソルが閉じマーカーの**後ろ**（" です。" の手前）まで
    // 移動してしまい、以降の Backspace がマーカーではなく本文を壊してしまう。
    const { empty, from: originalFrom, to: originalTo, anchor: originalAnchor } = state.selection;
    let tr = state.tr;

    for (const r of ranges) {
        const marker = getEditableInlineMarkMarker(r.type, r.href);
        tr = tr.insert(r.to, state.schema.text(marker.close));
        tr = tr.insert(r.from, state.schema.text(marker.open));
    }

    const result: ExpandedMarkRange[] = ranges.map(r => {
        const marker = getEditableInlineMarkMarker(r.type, r.href);
        const contentStart = tr.mapping.map(r.from, 1);
        const contentEnd = tr.mapping.map(r.to, -1);
        const range: ExpandedMarkRange = {
            type: r.type,
            contentStart,
            contentEnd,
            openLen: marker.open.length,
            closeLen: marker.close.length
        };
        if (r.type === 'link') {
            // 外側境界を bias +1/-1 で追跡する（境界ちょうどの外部からの挿入は
            // 展開領域の「外」に留めるため）。appendTransaction で同じ bias で
            // 追随マッピングする。
            range.openMarkerStart = tr.mapping.map(r.from, -1);
            range.closeMarkerEnd = tr.mapping.map(r.to, 1);
            range.originalHref = r.href ?? '';
        }
        return range;
    });

    // 選択が空でない場合（範囲選択の途中でブロックへフォーカスが入った場合）は、
    // 見えていた選択範囲をそのまま維持する（新しく挿入したマーカー文字を巻き込まない
    // よう、開始側は bias +1・終了側は bias -1 でマッピングする）。選択が空の場合は
    // 上記コメントの単一カーソル保存ロジック（bias -1）をそのまま使う。
    let newAnchor: number;
    let newHead: number;
    if (empty) {
        const mapped = tr.mapping.map(originalFrom, -1);
        newAnchor = mapped;
        newHead = mapped;
    } else {
        const mappedFrom = tr.mapping.map(originalFrom, 1);
        const mappedTo = tr.mapping.map(originalTo, -1);
        const backward = originalAnchor === originalTo;
        newAnchor = backward ? mappedTo : mappedFrom;
        newHead = backward ? mappedFrom : mappedTo;
    }
    tr = tr.setSelection(TextSelection.create(tr.doc, newAnchor, newHead));
    tr.setMeta('addToHistory', false);
    tr.setMeta(PLUGIN_META, 'expand');

    view.dispatch(tr);
    return result;
}

/**
 * collapse 完了後にホストへの markdown 同期を強制する外部フック。
 * `blockPrefixEditPlugin.setOnCollapseSync` と同じ理由（addToHistory:false の
 * transaction は Milkdown の markdownUpdated リスナーに無視されるため）。
 */
let onCollapseSync: (() => void) | null = null;

export function setOnCollapseSync(fn: (() => void) | null): void {
    onCollapseSync = fn;
}

function collapseBlock(view: EditorView, marks: ExpandedMarkRange[]): void {
    if (marks.length === 0) return;
    const { state } = view;
    const doc = state.doc;
    let tr = state.tr;

    interface ResolvedNonLink {
        kind: 'non-link';
        contentStart: number;
        contentEnd: number;
        openSurvived: number;
        closeSurvived: number;
        originalType: Exclude<EditableInlineMarkType, 'link'>;
        resolvedType: Exclude<EditableInlineMarkType, 'link'> | null;
    }
    interface ResolvedLink {
        kind: 'link';
        contentStart: number;
        contentEnd: number;
        openMarkerStart: number;
        closeMarkerEnd: number;
        /** 開き側 "[" が編集されず残っているか。 */
        openMatched: boolean;
        /** 閉じ側が "](href)" 形式にマッチしたときの href（不一致なら null）。 */
        newHref: string | null;
        /** openMatched かつ newHref!==null のときのみ non-null（= link 維持）。 */
        resolvedHref: string | null;
        originalHref: string;
    }
    type Resolved = ResolvedNonLink | ResolvedLink;

    const resolved: Resolved[] = marks.map((m): Resolved => {
        if (m.type === 'link') {
            const openMarkerStart = m.openMarkerStart ?? m.contentStart - m.openLen;
            const closeMarkerEnd = m.closeMarkerEnd ?? m.contentEnd + m.closeLen;
            const openText = doc.textBetween(Math.max(0, openMarkerStart), m.contentStart);
            const closeText = doc.textBetween(m.contentEnd, Math.min(doc.content.size, closeMarkerEnd));
            const openMatched = isLinkOpenMarkerIntact(openText);
            const newHref = parseLinkCloseMarkerHref(closeText);
            return {
                kind: 'link',
                contentStart: m.contentStart,
                contentEnd: m.contentEnd,
                openMarkerStart,
                closeMarkerEnd,
                openMatched,
                newHref,
                resolvedHref: openMatched && newHref !== null ? newHref : null,
                originalHref: m.originalHref ?? ''
            };
        }
        const beforeText = doc.textBetween(Math.max(0, m.contentStart - m.openLen), m.contentStart);
        const afterText = doc.textBetween(m.contentEnd, Math.min(doc.content.size, m.contentEnd + m.closeLen));
        const openSurvived = countTrailingMarkerChars(beforeText, m.type, m.openLen);
        const closeSurvived = countLeadingMarkerChars(afterText, m.type, m.closeLen);
        return {
            kind: 'non-link',
            contentStart: m.contentStart,
            contentEnd: m.contentEnd,
            openSurvived,
            closeSurvived,
            originalType: m.type,
            resolvedType: resolveInlineMarkAfterEdit(m.type, openSurvived, closeSurvived)
        };
    });

    // マーカー文字の削除（残っている分だけ）。
    for (const r of resolved) {
        if (r.kind === 'link') {
            // 閉じ側・開き側それぞれ、現在も元の形を保っている分だけ独立に削除する
            // （どちらかが壊れていても、壊れていない側は削除してよい）。
            if (r.newHref !== null) {
                tr = tr.delete(tr.mapping.map(r.contentEnd, 1), tr.mapping.map(r.closeMarkerEnd, -1));
            }
            if (r.openMatched) {
                tr = tr.delete(tr.mapping.map(r.openMarkerStart, 1), tr.mapping.map(r.contentStart, -1));
            }
            continue;
        }
        if (r.closeSurvived > 0) {
            tr = tr.delete(tr.mapping.map(r.contentEnd, 1), tr.mapping.map(r.contentEnd + r.closeSurvived, -1));
        }
        if (r.openSurvived > 0) {
            tr = tr.delete(tr.mapping.map(r.contentStart - r.openSurvived, 1), tr.mapping.map(r.contentStart, -1));
        }
    }

    // マークの付け外し（削除後の最終位置で）。
    for (const r of resolved) {
        const from = tr.mapping.map(r.contentStart, 1);
        const to = tr.mapping.map(r.contentEnd, -1);
        if (from >= to) continue;

        if (r.kind === 'link') {
            if (r.resolvedHref === r.originalHref) continue; // 変化なし（元の href のまま）
            const linkMarkType = state.schema.marks.link;
            if (!linkMarkType) continue;
            tr = tr.removeMark(from, to, linkMarkType);
            if (r.resolvedHref !== null) {
                tr = tr.addMark(from, to, linkMarkType.create({ href: r.resolvedHref }));
            }
            continue;
        }

        if (r.resolvedType === r.originalType) continue; // 変化なし（元のマークのまま）
        const originalMarkType = state.schema.marks[r.originalType];
        if (originalMarkType) tr = tr.removeMark(from, to, originalMarkType);
        if (r.resolvedType) {
            const newMarkType = state.schema.marks[r.resolvedType];
            if (newMarkType) tr = tr.addMark(from, to, newMarkType.create());
        }
    }

    tr.setMeta('addToHistory', false);
    tr.setMeta(PLUGIN_META, 'collapse');
    view.dispatch(tr);
    onCollapseSync?.();
}

let isHandling = false;
let isDragging = false;

export function createInlineMarkEditPlugin() {
    return $prose(() => new Plugin({
        key: new PluginKey('inlineMarkEdit'),

        appendTransaction(transactions, _oldState, _newState) {
            if (expandedBlockPos === null || expandedMarks.length === 0) return null;
            let blockPos = expandedBlockPos;
            let changed = false;
            const nextMarks = expandedMarks.map(m => ({ ...m }));
            for (const tr of transactions) {
                if (tr.getMeta(PLUGIN_META)) continue;
                const mappedBlockPos = tr.mapping.map(blockPos, -1);
                if (mappedBlockPos !== blockPos) changed = true;
                blockPos = mappedBlockPos;
                for (const m of nextMarks) {
                    const newStart = tr.mapping.map(m.contentStart, -1);
                    const newEnd = tr.mapping.map(m.contentEnd, 1);
                    if (newStart !== m.contentStart || newEnd !== m.contentEnd) changed = true;
                    m.contentStart = newStart;
                    m.contentEnd = newEnd;
                    if (m.openMarkerStart !== undefined) {
                        const newOpenMarkerStart = tr.mapping.map(m.openMarkerStart, 1);
                        if (newOpenMarkerStart !== m.openMarkerStart) changed = true;
                        m.openMarkerStart = newOpenMarkerStart;
                    }
                    if (m.closeMarkerEnd !== undefined) {
                        const newCloseMarkerEnd = tr.mapping.map(m.closeMarkerEnd, -1);
                        if (newCloseMarkerEnd !== m.closeMarkerEnd) changed = true;
                        m.closeMarkerEnd = newCloseMarkerEnd;
                    }
                }
            }
            if (changed) {
                expandedBlockPos = blockPos;
                expandedMarks = nextMarks;
            }
            return null;
        },

        view(editorView) {
            const sync = (view: EditorView): void => {
                const focused = getFocusedInlineMarkBlock(view);
                const focusedPos = focused?.blockPos ?? null;

                if (focusedPos === expandedBlockPos) return; // 同じブロック or どちらも null

                isHandling = true;
                try {
                    if (expandedBlockPos !== null) {
                        const oldMarks = expandedMarks;
                        expandedBlockPos = null;
                        expandedMarks = [];
                        collapseBlock(view, oldMarks);
                    }

                    const newFocused = getFocusedInlineMarkBlock(view);
                    if (newFocused !== null && newFocused.ranges.length > 0) {
                        expandedBlockPos = newFocused.blockPos;
                        expandedMarks = expandBlock(view, newFocused.ranges);
                    }
                } finally {
                    isHandling = false;
                }
            };

            const onMouseDown = (): void => { isDragging = true; };
            const onMouseUp = (): void => {
                if (!isDragging) return;
                isDragging = false;
                setTimeout(() => sync(editorView), 0);
            };
            document.addEventListener('mousedown', onMouseDown);
            document.addEventListener('mouseup', onMouseUp);

            return {
                update(view: EditorView) {
                    if (isHandling) return;
                    if (isDragging) return;
                    sync(view);
                },
                destroy() {
                    document.removeEventListener('mousedown', onMouseDown);
                    document.removeEventListener('mouseup', onMouseUp);
                    expandedBlockPos = null;
                    expandedMarks = [];
                    isDragging = false;
                }
            };
        }
    }));
}
