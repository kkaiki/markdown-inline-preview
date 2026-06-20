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

/**
 * フォーカス中のリスト項目の DOM に class を付与する（リスト項目はカスタム Vue
 * nodeView のため node decoration が効かない）。CSS でアイコンを隠し、代わりに
 * `- ` / `- [ ] ` の記法マーカーを見せる。
 */
function focusedListItemDOM(view: EditorView): Element | null {
    if (!enabled) return null;
    const $from = view.state.selection.$from;
    for (let depth = $from.depth; depth > 0; depth--) {
        if ($from.node(depth).type.name === 'list_item') {
            const dom = view.nodeDOM($from.before(depth));
            return dom instanceof Element ? dom : null;
        }
    }
    return null;
}

function mkMarker(text: string, extraClass?: string): () => HTMLElement {
    return () => {
        const el = document.createElement('span');
        el.className = extraClass ? `md-syntax-marker ${extraClass}` : 'md-syntax-marker';
        el.textContent = text;
        el.setAttribute('aria-hidden', 'true');
        return el;
    };
}

export const focusSyntaxPlugin = $prose(() => {
    return new Plugin({
        key: new PluginKey('focusSyntax'),
        props: {
            decorations(state) {
                if (!enabled) return DecorationSet.empty;

                const depth = findFocusedBlockDepth(state.selection.$from);
                if (depth === null) return DecorationSet.empty;

                const $pos = state.selection.$from;
                const blockStart = $pos.start(depth);
                const blockEnd = $pos.end(depth);
                const decorations = [];

                const prefix = getBlockPrefix($pos, depth);
                if (prefix) {
                    // Rendered as an absolutely-positioned overlay (see CSS) so it doesn't
                    // push the block's real text - and the cursor - to the right when focused.
                    decorations.push(
                        Decoration.widget(blockStart, mkMarker(prefix, 'md-syntax-marker--block-prefix'), { side: -1, key: `prefix-${blockStart}` })
                    );
                }

                for (const { pos, end, marker } of collectInlineMarksInRange(state.doc, blockStart, blockEnd)) {
                    decorations.push(
                        Decoration.widget(pos, mkMarker(marker.open), { side: -1, key: `open-${pos}` }),
                        Decoration.widget(end, mkMarker(marker.close), { side: 1, key: `close-${end}` })
                    );
                }

                return DecorationSet.create(state.doc, decorations);
            }
        },
        view(editorView) {
            let marked: Element | null = null;
            const sync = (view: EditorView): void => {
                const next = focusedListItemDOM(view);
                if (next === marked) return;
                marked?.classList.remove('md-focus-list-item');
                next?.classList.add('md-focus-list-item');
                marked = next;
            };
            sync(editorView);
            return {
                update: (view) => sync(view),
                destroy: () => marked?.classList.remove('md-focus-list-item')
            };
        }
    });
});
