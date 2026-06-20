import { Plugin, PluginKey } from '@milkdown/prose/state';
import { TextSelection } from '@milkdown/prose/state';
import { $prose } from '@milkdown/utils';

import { buildHeadingDowngradeText, isAtHeadingContentStart } from '../../shared/markdown/headingBackspace';

export const headingBackspacePlugin = $prose(() => {
    return new Plugin({
        key: new PluginKey('headingBackspace'),
        priority: 100,
        props: {
            handleKeyDown(view, event) {
                if (event.key !== 'Backspace') return false;

                const { state } = view;
                const { $from, empty } = state.selection;
                if (!empty) return false;

                let headingDepth = -1;
                for (let depth = $from.depth; depth > 0; depth--) {
                    if ($from.node(depth).type.name === 'heading') {
                        headingDepth = depth;
                        break;
                    }
                }
                if (headingDepth < 0) return false;

                const heading = $from.node(headingDepth);
                const contentStart = $from.start(headingDepth);
                if (!isAtHeadingContentStart(heading.type.name, $from.pos, contentStart)) {
                    return false;
                }

                const paragraphType = state.schema.nodes.paragraph;
                if (!paragraphType) return false;

                const level = Number(heading.attrs.level) || 1;
                const paragraphText = buildHeadingDowngradeText(level, heading.textContent);
                const textNode = paragraphText ? state.schema.text(paragraphText) : undefined;
                const paragraph = paragraphType.create(null, textNode);

                const headingPos = $from.before(headingDepth);
                const tr = state.tr.replaceWith(
                    headingPos,
                    headingPos + heading.nodeSize,
                    paragraph
                );

                const hashLen = paragraphText.length - heading.textContent.length;
                const cursorPos = headingPos + 1 + hashLen;
                tr.setSelection(TextSelection.create(tr.doc, cursorPos));

                view.dispatch(tr.scrollIntoView());
                event.preventDefault();
                return true;
            }
        }
    });
});
