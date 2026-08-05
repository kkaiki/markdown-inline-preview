/**
 * Live モードの行番号ガター。
 *
 * Obsidian 実測（obsidian-observed-spec.md §5）に合わせる:
 *   行番号は**視覚行に1対1**で対応し、ウィジェットに畳まれたブロック（表・コールアウト・
 *   数式ブロック）はその**先頭のソース行番号だけ**を表示する。
 *
 * CodeMirror 標準の `lineNumbers()` はブロックウィジェットに marker を付けないため、
 * 畳まれたブロックの番号が丸ごと消えてしまう。そこで `widgetMarker` を持つ
 * 独自のガターを使う。
 */
import { GutterMarker, gutter, type BlockInfo, type EditorView } from '@codemirror/view';

class LineNumberMarker extends GutterMarker {
    constructor(private readonly value: number) {
        super();
    }

    eq(other: LineNumberMarker): boolean {
        return other.value === this.value;
    }

    toDOM(): Text {
        return document.createTextNode(String(this.value));
    }
}

/** その位置のソース行番号。 */
function sourceLineNumber(view: EditorView, at: number): number {
    return view.state.doc.lineAt(at).number;
}

export const liveLineNumbers = gutter({
    class: 'cm-lineNumbers cm-live-gutter',
    lineMarker: (view: EditorView, line: BlockInfo) => new LineNumberMarker(sourceLineNumber(view, line.from)),
    /*
     * 畳まれたブロック（表・コールアウトなど）には先頭のソース行番号を出す。
     * ただし数式のプレビューのように「ソースを置換せず下に足しただけ」の
     * 幅0ウィジェットには番号を出さない（同じ行番号が2回出てしまうため）。
     */
    widgetMarker: (view: EditorView, _widget: unknown, block: BlockInfo) =>
        block.length === 0 ? null : new LineNumberMarker(sourceLineNumber(view, block.from)),
    initialSpacer: (view: EditorView) => new LineNumberMarker(view.state.doc.lines)
});
