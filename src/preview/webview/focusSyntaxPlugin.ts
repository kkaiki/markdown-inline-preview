import { Plugin, PluginKey } from '@milkdown/prose/state';
import { Decoration, DecorationSet } from '@milkdown/prose/view';
import type { EditorView } from '@milkdown/prose/view';
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
 * フォーカス中のブロックに、行頭マーカー（`## ` `- ` `1. ` `- [ ] ` `> `）を
 * CSS の ::before で見せるためのフックを付ける。
 *
 * widget decoration ではなく DOM への class + data 属性 + CSS 生成内容で表示するため、
 * 文書モデルには何も挿入されず、カーソル移動に一切影響しない（編集時の目印用）。
 * フォーカスが外れた行ではマーカーは消える（レンダリング表示に戻る）。
 */
function focusBlockTarget(view: EditorView): { el: Element; prefix: string; isList: boolean } | null {
    if (!enabled) return null;
    const $from = view.state.selection.$from;
    const depth = findFocusedBlockDepth($from);
    if (depth === null) return null;
    const prefix = getBlockPrefix($from, depth);
    if (!prefix) return null;

    let listDepth = -1;
    for (let d = $from.depth; d > 0; d--) {
        if ($from.node(d).type.name === 'list_item') { listDepth = d; break; }
    }

    if (listDepth >= 0) {
        const dom = view.nodeDOM($from.before(listDepth));
        const root = dom instanceof Element ? dom : null;
        const el = root?.querySelector('li.list-item') ?? root;
        return el ? { el, prefix, isList: true } : null;
    }

    const dom = view.nodeDOM($from.before(depth));
    return dom instanceof Element ? { el: dom, prefix, isList: false } : null;
}

export const focusSyntaxPlugin = $prose(() => {
    return new Plugin({
        key: new PluginKey('focusSyntax'),
        props: {
            // 行内マーカー（** * ` ~~ [..](..)）はフォーカス行に widget で表示する
            decorations(state) {
                if (!enabled) return DecorationSet.empty;

                const depth = findFocusedBlockDepth(state.selection.$from);
                if (depth === null) return DecorationSet.empty;

                const $pos = state.selection.$from;
                const blockStart = $pos.start(depth);
                const blockEnd = $pos.end(depth);
                const decorations = [];

                for (const { pos, end, marker } of collectInlineMarksInRange(state.doc, blockStart, blockEnd)) {
                    decorations.push(
                        Decoration.widget(pos, mkMarker(marker.open), { side: -1, key: `open-${pos}` }),
                        Decoration.widget(end, mkMarker(marker.close), { side: 1, key: `close-${end}` })
                    );
                }

                return DecorationSet.create(state.doc, decorations);
            }
        },
        // 行頭マーカーは DOM への class/data 属性 + CSS で表示（カーソルに影響しない）
        view(editorView) {
            let marked: Element | null = null;
            const clear = (): void => {
                marked?.classList.remove('md-focus-block', 'md-focus-list');
                marked?.removeAttribute('data-md-prefix');
                marked = null;
            };
            const sync = (view: EditorView): void => {
                const target = focusBlockTarget(view);
                if (marked && marked !== target?.el) clear();
                if (!target) return;
                target.el.classList.add('md-focus-block');
                if (target.isList) target.el.classList.add('md-focus-list');
                target.el.setAttribute('data-md-prefix', target.prefix);
                marked = target.el;
            };
            sync(editorView);
            return {
                update: (view) => sync(view),
                destroy: clear
            };
        }
    });
});
