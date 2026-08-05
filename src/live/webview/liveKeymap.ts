/**
 * Live モードのキーマップ。
 *
 * Obsidian 実測（obsidian-observed-spec.md §4）に合わせる。ここで**登録しない**キーが
 * 重要な意味を持つ:
 *   - `Backspace` は登録しない。行頭付近でも素の1文字削除に委ねる（記法解除しない）。
 *   - `Mod-z` / `Mod-y` は登録しない。Undo は VS Code 側へ一本化する。
 */
import { indentLess, indentMore } from '@codemirror/commands';
import { indentUnit } from '@codemirror/language';
import { type KeyBinding } from '@codemirror/view';
import type { EditorView } from '@codemirror/view';
import { parseLinePrefix, parseQuotePrefix, resolveEnter, resolveSmartHome } from '../shared/liveEditing';

/** Enter: リスト・チェックボックス・引用の継続と、空マーカー行のマーカー削除。 */
function liveEnter(view: EditorView): boolean {
    const sel = view.state.selection.main;
    if (!sel.empty) return false;
    const line = view.state.doc.lineAt(sel.head);
    const r = resolveEnter(line.text, sel.head - line.from);
    if (!r) return false;

    if (r.deleteFrom !== null) {
        const from = line.from + r.deleteFrom;
        view.dispatch({
            changes: { from, to: sel.head, insert: r.insert },
            selection: { anchor: from + r.insert.length },
            scrollIntoView: true,
            userEvent: 'input'
        });
        return true;
    }
    view.dispatch({
        changes: { from: sel.head, insert: r.insert },
        selection: { anchor: sel.head + r.insert.length },
        scrollIntoView: true,
        userEvent: 'input'
    });
    return true;
}

/** Home: リスト系だけ「本文先頭 → 行頭」の2段階。 */
function liveHome(view: EditorView): boolean {
    const sel = view.state.selection.main;
    const line = view.state.doc.lineAt(sel.head);
    const target = line.from + resolveSmartHome(line.text, sel.head - line.from);
    view.dispatch({ selection: { anchor: target }, scrollIntoView: true });
    return true;
}

/** カーソルのある行がコードフェンスの内側か（内側の Tab は素の文字挿入にする）。 */
function insideCodeFence(view: EditorView): boolean {
    const head = view.state.selection.main.head;
    const target = view.state.doc.lineAt(head).number;
    let open = false;
    for (let n = 1; n < target; n++) {
        if (/^\s*(`{3,}|~{3,})/.test(view.state.doc.line(n).text)) open = !open;
    }
    return open;
}

/** Tab: リスト項目と複数行選択はインデント、それ以外は素のインデント文字を挿入。 */
function liveIndent(view: EditorView): boolean {
    const sel = view.state.selection.main;
    const line = view.state.doc.lineAt(sel.head);
    const multiline = !sel.empty && view.state.doc.lineAt(sel.from).number !== view.state.doc.lineAt(sel.to).number;
    const isList = parseLinePrefix(line.text).kind !== 'none';
    if (!insideCodeFence(view) && (multiline || isList)) return indentMore(view);

    const unit = view.state.facet(indentUnit);
    view.dispatch({
        changes: { from: sel.from, to: sel.to, insert: unit },
        selection: { anchor: sel.from + unit.length },
        userEvent: 'input'
    });
    return true;
}

/** Shift+Tab: アウトデント。 */
function liveOutdent(view: EditorView): boolean {
    return indentLess(view);
}

export const liveKeymap: KeyBinding[] = [
    { key: 'Enter', run: liveEnter },
    { key: 'Home', run: liveHome },
    { key: 'Tab', run: liveIndent },
    { key: 'Shift-Tab', run: liveOutdent }
];

/** 引用行かどうか（デコレーション側と判定を揃えるための再エクスポート）。 */
export { parseQuotePrefix };
