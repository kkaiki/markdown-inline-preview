import { Plugin, PluginKey } from '@milkdown/prose/state';
import { Decoration, DecorationSet } from '@milkdown/prose/view';
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
                    decorations.push(
                        Decoration.widget(blockStart, mkMarker(prefix), { side: -1, key: `prefix-${blockStart}` })
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
        }
    });
});
