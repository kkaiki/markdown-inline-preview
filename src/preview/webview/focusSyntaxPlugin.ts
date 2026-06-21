import { Plugin, PluginKey } from '@milkdown/prose/state';
import { Decoration, DecorationSet } from '@milkdown/prose/view';
import type { ResolvedPos } from '@milkdown/prose/model';
import { $prose } from '@milkdown/utils';

import {
    collectInlineMarksInRange,
    findFocusedBlockDepth,
    getBlockPrefix
} from '../../shared/markdown/focusSyntaxHelpers';

let enabled = true;

export function setFocusSyntaxEnabled(value: boolean): void {
    enabled = value;
}

function mkMarker(text: string): () => HTMLElement {
    return () => {
        const el = document.createElement('span');
        el.className = 'md-syntax-marker';
        el.textContent = text;
        el.setAttribute('aria-hidden', 'true');
        return el;
    };
}

/**
 * フォーカス中のブロックに対応する行頭マーカーの node decoration を返す。
 * （`## ` `- ` `1. ` `- [ ] ` `> ` を CSS の ::before で見せるための class/属性）
 *
 * 以前は plugin の `view` から ProseMirror 管理下の DOM へ直接 classList.add /
 * setAttribute していたが、それが ProseMirror の DOMObserver を発火させて
 * 「DOM 変更 → 再描画 → view.update → また DOM 変更」の無限ループ（＝編集不能）を
 * 引き起こしていた。node decoration なら ProseMirror 自身が描画時に属性を付けるので
 * observer ループにならず、文書モデルにも何も挿入されないのでカーソルにも影響しない。
 */
function blockMarkerDecoration($from: ResolvedPos): Decoration | null {
    const depth = findFocusedBlockDepth($from);
    if (depth === null) return null;
    const prefix = getBlockPrefix($from, depth);
    if (!prefix) return null;

    let listDepth = -1;
    for (let d = $from.depth; d > 0; d--) {
        if ($from.node(d).type.name === 'list_item') { listDepth = d; break; }
    }

    const nodeDepth = listDepth >= 0 ? listDepth : depth;
    const from = $from.before(nodeDepth);
    const to = from + $from.node(nodeDepth).nodeSize;
    const className = listDepth >= 0 ? 'md-focus-block md-focus-list' : 'md-focus-block';
    return Decoration.node(from, to, { class: className, 'data-md-prefix': prefix });
}

export const focusSyntaxPlugin = $prose(() => {
    return new Plugin({
        key: new PluginKey('focusSyntax'),
        props: {
            // フォーカス行の行頭マーカー（node decoration）と
            // 行内マーカー（** * ` ~~ [..](..) を widget）をまとめて返す。
            decorations(state) {
                if (!enabled) return DecorationSet.empty;
                try {
                    const $pos = state.selection.$from;
                    const depth = findFocusedBlockDepth($pos);
                    if (depth === null) return DecorationSet.empty;

                    const decorations: Decoration[] = [];

                    const blockMarker = blockMarkerDecoration($pos);
                    if (blockMarker) decorations.push(blockMarker);

                    const blockStart = $pos.start(depth);
                    const blockEnd = $pos.end(depth);
                    for (const { pos, end, marker } of collectInlineMarksInRange(state.doc, blockStart, blockEnd)) {
                        decorations.push(
                            Decoration.widget(pos, mkMarker(marker.open), { side: -1, key: `open-${pos}` }),
                            Decoration.widget(end, mkMarker(marker.close), { side: 1, key: `close-${end}` })
                        );
                    }

                    return DecorationSet.create(state.doc, decorations);
                } catch {
                    return DecorationSet.empty;
                }
            }
        }
    });
});
