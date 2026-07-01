/**
 * インライン記法マーカー（`` ` `` / `**` / `*` / `~~` / `[..](..)`）の「削除」。
 *
 * Preview は WYSIWYG なので、インライン記法は文字ではなく **mark** として表現される。
 * フォーカス中はその記法マーカーを装飾（widget decoration）で見せているが、装飾は実体の
 * 文字ではないため Backspace/Delete で消せず、「記法を解除できない（編集できない）」状態だった。
 *
 * ここでは、カーソルがマーク範囲の**端**（マーカーが表示される位置）にあるとき、Backspace
 * （末尾側＝閉じマーカー）/ Delete（先頭側＝開きマーカー）でその mark を範囲から取り除く。
 * これにより「閉じ `` ` `` を消す → コード装飾が外れる」のように、見えているマーカーを
 * 文字のように消して記法を解除できる。
 */
import { Plugin, PluginKey } from '@milkdown/prose/state';
import type { EditorState } from '@milkdown/prose/state';
import type { Mark, Node as ProseNode } from '@milkdown/prose/model';
import { $prose } from '@milkdown/utils';

/** 解除できるインライン mark（focusSyntaxHelpers のマーカー対象と一致させる）。 */
export const REMOVABLE_INLINE_MARKS: ReadonlySet<string> = new Set([
    'strong',
    'emphasis',
    'inlineCode',
    'strike_through',
    'link'
]);

export interface InlineMarkRemoval {
    from: number;
    to: number;
    markName: string;
}

/** mark を含む連続テキストの先頭位置（lowerBound より手前へは行かない）。 */
function runStart(doc: ProseNode, pos: number, mark: Mark, lowerBound: number): number {
    let from = pos;
    while (from > lowerBound) {
        const before = doc.resolve(from).nodeBefore;
        if (before && before.isText && mark.isInSet(before.marks)) {
            from -= before.nodeSize;
        } else {
            break;
        }
    }
    return from;
}

/** mark を含む連続テキストの末尾位置（upperBound より後ろへは行かない）。 */
function runEnd(doc: ProseNode, pos: number, mark: Mark, upperBound: number): number {
    let to = pos;
    while (to < upperBound) {
        const after = doc.resolve(to).nodeAfter;
        if (after && after.isText && mark.isInSet(after.marks)) {
            to += after.nodeSize;
        } else {
            break;
        }
    }
    return to;
}

/**
 * 現在のカーソル位置で「Backspace（backward）/ Delete（forward）が解除すべきインライン mark」を返す。
 * - backward: マークが**カーソル位置で閉じている**（直前の文字に在り、直後の文字には無い）とき。
 * - forward:  マークが**カーソル位置で開いている**（直後の文字に在り、直前の文字には無い）とき。
 * 該当が無ければ null（＝通常の Backspace/Delete に委ねる）。
 */
export function computeInlineMarkRemoval(
    state: EditorState,
    direction: 'backward' | 'forward'
): InlineMarkRemoval | null {
    const { selection, doc } = state;
    if (!selection.empty) return null;
    const $pos = selection.$from;
    const pos = $pos.pos;
    const blockStart = $pos.start();
    const blockEnd = $pos.end();

    const $at = doc.resolve(pos);
    const before = pos > blockStart ? $at.nodeBefore : null;
    const after = pos < blockEnd ? $at.nodeAfter : null;
    const marksBefore: readonly Mark[] = before?.isText ? before.marks : [];
    const marksAfter: readonly Mark[] = after?.isText ? after.marks : [];

    if (direction === 'backward') {
        for (const mark of marksBefore) {
            if (!REMOVABLE_INLINE_MARKS.has(mark.type.name)) continue;
            if (mark.isInSet(marksAfter)) continue; // まだ閉じていない（次の文字にも在る）
            return { from: runStart(doc, pos, mark, blockStart), to: pos, markName: mark.type.name };
        }
        return null;
    }

    for (const mark of marksAfter) {
        if (!REMOVABLE_INLINE_MARKS.has(mark.type.name)) continue;
        if (mark.isInSet(marksBefore)) continue; // まだ開いていない（前の文字にも在る）
        return { from: pos, to: runEnd(doc, pos, mark, blockEnd), markName: mark.type.name };
    }
    return null;
}

export function createInlineMarkBackspacePlugin() {
    return $prose(() => new Plugin({
        key: new PluginKey('inlineMarkBackspace'),
        priority: 100, // 既定の Backspace/Delete より先に処理する
        props: {
            handleKeyDown(view, event) {
                const direction =
                    event.key === 'Backspace' ? 'backward'
                    : event.key === 'Delete' ? 'forward'
                    : null;
                if (!direction) return false;

                const removal = computeInlineMarkRemoval(view.state, direction);
                if (!removal) return false;

                const markType = view.state.schema.marks[removal.markName];
                if (!markType) return false;

                const tr = view.state.tr.removeMark(removal.from, removal.to, markType);
                // 直後の入力でマークが復活しないよう stored marks も消す。
                tr.setStoredMarks([]);
                view.dispatch(tr);
                event.preventDefault();
                return true;
            }
        }
    }));
}
