/**
 * Excel・Google スプレッドシート・Numbers の範囲を貼り付けたら Markdown の表にする（Live モード）。
 *
 * 変換規則は `src/shared/table/spreadsheetPaste.ts`（純関数）。ここは paste イベントを受けて
 * 貼り付け位置の前後を調べ、CodeMirror へ差分を入れるだけ。表にしないときは false を返して
 * CodeMirror の通常の貼り付けに任せる（docs/specifications/live-mode/requirements.md §2.7.3）。
 */
import { EditorView } from '@codemirror/view';
import { spreadsheetToMarkdownTable, surroundTableForInsertion } from '../../shared/table/spreadsheetPaste';
import { findFenceBlocks } from '../shared/fenceBlocks';

/** 0 始まりの行番号がコードブロックの中身（フェンス行の間）か。 */
function insideFence(view: EditorView, lineIndex: number): boolean {
    const doc = view.state.doc;
    const lines: string[] = [];
    for (let i = 1; i <= doc.lines; i++) lines.push(doc.line(i).text);
    return findFenceBlocks(lines).some(
        (b) => lineIndex > b.openLine && (b.closeLine === null || lineIndex < b.closeLine)
    );
}

export const liveSpreadsheetPaste = EditorView.domEventHandlers({
    paste(event, view) {
        const data = event.clipboardData;
        if (!data) return false;

        const table = spreadsheetToMarkdownTable(data.getData('text/plain'), data.getData('text/html'));
        if (!table) return false;

        const { state } = view;
        const sel = state.selection.main;
        const startLine = state.doc.lineAt(sel.from);
        const endLine = state.doc.lineAt(sel.to);
        if (insideFence(view, startLine.number - 1)) return false;

        const insert = surroundTableForInsertion(table, {
            before: startLine.text.slice(0, sel.from - startLine.from),
            after: endLine.text.slice(sel.to - endLine.from),
            prevLine: startLine.number > 1 ? state.doc.line(startLine.number - 1).text : '',
            nextLine: endLine.number < state.doc.lines ? state.doc.line(endLine.number + 1).text : ''
        });

        view.dispatch({
            changes: { from: sel.from, to: sel.to, insert },
            selection: { anchor: sel.from + insert.length },
            userEvent: 'input.paste',
            scrollIntoView: true
        });
        event.preventDefault();
        return true;
    }
});
