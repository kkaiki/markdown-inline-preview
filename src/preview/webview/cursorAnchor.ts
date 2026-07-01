/**
 * Preview（Milkdown / ProseMirror）側のカーソル ⇄ ブロックアンカー変換。
 * 共有の `CursorAnchor`（ブロック index + ブロック内オフセット）で Raw と位置を引き継ぐ。
 */
import { TextSelection } from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';
import type { Node as ProseNode } from '@milkdown/prose/model';
import type { CursorAnchor } from '../../shared/preview/cursorAnchor';

/** 現在のカーソル位置 → ブロックアンカー（トップレベルノード index + textContent 風オフセット）。 */
export function getPreviewCursorAnchor(view: EditorView): CursorAnchor {
    const { doc, selection } = view.state;
    const pos = selection.from;
    let block = 0;
    let offset = 0;

    let index = 0;
    let done = false;
    doc.forEach((node, nodeOffset) => {
        if (done) return;
        const start = nodeOffset;
        const end = nodeOffset + node.nodeSize;
        if (pos >= start && pos <= end) {
            block = index;
            // ブロック内容は start+1 から。textblock ならこれが textContent オフセットに一致。
            offset = Math.max(0, pos - (start + 1));
            done = true;
        }
        index++;
    });
    return { block, offset };
}

/** ブロックアンカー → カーソルを復元（クランプして近い位置へ）。スクロールも合わせる。 */
export function applyPreviewCursorAnchor(view: EditorView, anchor: CursorAnchor): void {
    const { doc } = view.state;
    const tops: Array<{ node: ProseNode; offset: number }> = [];
    doc.forEach((node, offset) => tops.push({ node, offset }));
    if (tops.length === 0) return;

    const target = tops[Math.min(Math.max(anchor.block, 0), tops.length - 1)];
    const contentStart = target.offset + 1;
    const inner = Math.min(Math.max(anchor.offset, 0), Math.max(0, target.node.content.size));
    const rawPos = Math.min(Math.max(contentStart + inner, 0), doc.content.size);

    try {
        const $pos = doc.resolve(rawPos);
        const selection = TextSelection.near($pos);
        view.dispatch(view.state.tr.setSelection(selection).scrollIntoView());
        view.focus();
    } catch {
        // 解決に失敗しても落とさない（カーソル復元のみ諦める）。
    }
}
