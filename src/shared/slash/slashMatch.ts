import type { EditorView } from '@milkdown/prose/view';

export interface SlashMatch {
    from: number;
    to: number;
    query: string;
}

export function detectSlashMatch(view: EditorView): SlashMatch | null {
    const { $from, empty } = view.state.selection;
    if (!empty || !($from.parent.isTextblock || $from.parent.type.name === 'paragraph')) return null;

    const textBefore = $from.parent.textBetween(0, $from.parentOffset, undefined, '\ufffc');
    if (!textBefore.startsWith('/')) return null;

    const query = textBefore.slice(1);
    const from = $from.pos - textBefore.length;
    return { from, to: $from.pos, query };
}
