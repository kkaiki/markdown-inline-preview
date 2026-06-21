import { Plugin, PluginKey } from '@milkdown/prose/state';
import { Decoration, DecorationSet } from '@milkdown/prose/view';
import { $prose } from '@milkdown/utils';

import {
    collectInlineMarksInRange,
    findFocusedBlockDepth
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

// 行頭マーカー（`## ` `- ` `- [ ] `）は表示しない。行頭の widget decoration が
// カーソルの左移動を阻害して不自然になるため。行内のマーカー（** * ` ~~ [..](..)）
// のみフォーカス時に表示する。
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

                for (const { pos, end, marker } of collectInlineMarksInRange(state.doc, blockStart, blockEnd)) {
                    decorations.push(
                        Decoration.widget(pos, mkMarker(marker.open), { side: -1, key: `open-${pos}` }),
                        Decoration.widget(end, mkMarker(marker.close), { side: 1, key: `close-${end}` })
                    );
                }

                return DecorationSet.create(state.doc, decorations);
            }
        }
    });
});
