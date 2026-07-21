import type { EditorView } from '@milkdown/prose/view';

import { virtualLineStart } from '../preview/hardbreakLine';

export interface SlashMatch {
    from: number;
    to: number;
    query: string;
}

export function detectSlashMatch(view: EditorView): SlashMatch | null {
    const { $from, empty } = view.state.selection;
    if (!empty || !($from.parent.isTextblock || $from.parent.type.name === 'paragraph')) return null;

    // Enter \u3067\u4f5c\u3089\u308c\u305f hardbreak \u306e\u76f4\u5f8c\uff08\uff1d\u5b9f\u8cea\u7684\u306a\u300c\u884c\u982d\u300d\uff09\u3092\u57fa\u6e96\u306b\u5224\u5b9a\u3059\u308b\u3002
    // hardbreak \u304c\u7121\u3051\u308c\u3070\u5f93\u6765\u3069\u304a\u308a\u30c6\u30ad\u30b9\u30c8\u30d6\u30ed\u30c3\u30af\u5148\u982d\u304c\u57fa\u6e96\u306b\u306a\u308b\u3002
    const lineStart = virtualLineStart($from);
    const textBefore = $from.parent.textBetween(lineStart - $from.start(), $from.parentOffset, undefined, '\ufffc');
    if (!textBefore.startsWith('/')) return null;

    const query = textBefore.slice(1);
    const from = $from.pos - textBefore.length;
    return { from, to: $from.pos, query };
}
