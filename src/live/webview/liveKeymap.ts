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
import {
    parseLinePrefix,
    parseQuotePrefix,
    resolveEnter,
    resolveFenceEnter,
    resolveSmartHome
} from '../shared/liveEditing';
import { applyBlockAction } from '../shared/blockActions';
import { nextSelectAllRange } from '../shared/selectAllScope';
import { getNotionBlockAction, type NotionBlockAction } from '../../shared/preview/previewShortcuts';

/** Enter: リスト・チェックボックス・引用の継続と、空マーカー行のマーカー削除。 */
function liveEnter(view: EditorView): boolean {
    const sel = view.state.selection.main;
    if (!sel.empty) return false;

    /*
     * 閉じていない開始フェンスの行末なら、本文行と閉じフェンスを補う。
     * 本文行が無いとコードブロックの「中」にカーソルを置く場所そのものが無い
     * （ユーザー報告 2026-08-05）。
     */
    const fence = resolveFenceEnter(view.state.doc.toString(), sel.head);
    if (fence) {
        view.dispatch({
            changes: { from: sel.head, insert: fence.insert },
            selection: { anchor: sel.head + fence.cursorDelta },
            scrollIntoView: true,
            userEvent: 'input'
        });
        return true;
    }

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

/**
 * Notion 風のブロック変換を当てる（⌥⌘0〜9 とツールバーから共用）。
 * カーソルのある行（複数選択なら選択が触れている全行）を変換する。
 */
export function applyBlockActionToSelection(view: EditorView, action: NotionBlockAction): boolean {
    const { state } = view;
    const sel = state.selection.main;
    const first = state.doc.lineAt(sel.from).number;
    const last = state.doc.lineAt(sel.to).number;

    if (action === 'codeBlock') {
        // コードブロックだけは行の置換で表せないので、選択範囲をフェンスで包む
        const from = state.doc.line(first).from;
        const to = state.doc.line(last).to;
        const body = state.doc.sliceString(from, to);
        view.dispatch({
            changes: { from, to, insert: `\u0060\u0060\u0060\n${body}\n\u0060\u0060\u0060` },
            userEvent: 'input'
        });
        return true;
    }

    const changes: { from: number; to: number; insert: string }[] = [];
    let caret = sel.head;
    for (let n = first; n <= last; n++) {
        const line = state.doc.line(n);
        const r = applyBlockAction(line.text, action);
        if (!r) continue;
        changes.push({ from: line.from, to: line.to, insert: r.text });
        if (n === state.doc.lineAt(sel.head).number) caret = line.from + r.contentStart;
    }
    if (changes.length === 0) return false;
    view.dispatch({ changes, selection: { anchor: caret }, scrollIntoView: true, userEvent: 'input' });
    return true;
}

/** 選択を記号で囲む（囲み済みなら外す）。ツールバーの B / I / <> から使う。 */
export function wrapInlineMarker(view: EditorView, marker: string): boolean {
    const sel = view.state.selection.main;
    const text = view.state.doc.sliceString(sel.from, sel.to);
    const wrapped = text.startsWith(marker) && text.endsWith(marker) && text.length >= marker.length * 2;
    const insert = wrapped ? text.slice(marker.length, -marker.length) : `${marker}${text}${marker}`;
    const inner = wrapped ? insert.length : text.length;
    view.dispatch({
        changes: { from: sel.from, to: sel.to, insert },
        selection: { anchor: sel.from + (wrapped ? 0 : marker.length), head: sel.from + (wrapped ? 0 : marker.length) + inner },
        userEvent: 'input'
    });
    return true;
}

/** ⌥⌘0〜9 のブロック変換キーバインド。対応表は Raw / Preview と共通。 */
const blockKeymap: KeyBinding[] = [];
for (let n = 0; n <= 9; n++) {
    const action = getNotionBlockAction(n);
    if (!action) continue;
    blockKeymap.push({
        key: `Mod-Alt-${n}`,
        run: (view: EditorView) => applyBlockActionToSelection(view, action)
    });
}

/**
 * ⌘A: 押すたびに選択を広げる。
 * コードフェンスなら 中身 → ブロック全体 → 文書全体、表なら 行 → 表全体 → 文書全体。
 */
function liveSelectAll(view: EditorView): boolean {
    const sel = view.state.selection.main;
    const next = nextSelectAllRange(view.state.doc.toString(), { from: sel.from, to: sel.to });
    view.dispatch({ selection: { anchor: next.from, head: next.to } });
    return true;
}

export const liveKeymap: KeyBinding[] = [
    { key: 'Mod-a', run: liveSelectAll },
    ...blockKeymap,
    { key: 'Mod-b', run: (view) => wrapInlineMarker(view, '**') },
    { key: 'Mod-i', run: (view) => wrapInlineMarker(view, '*') },
    { key: 'Enter', run: liveEnter },
    { key: 'Home', run: liveHome },
    { key: 'Tab', run: liveIndent },
    { key: 'Shift-Tab', run: liveOutdent }
];

/** 引用行かどうか（デコレーション側と判定を揃えるための再エクスポート）。 */
export { parseQuotePrefix };
