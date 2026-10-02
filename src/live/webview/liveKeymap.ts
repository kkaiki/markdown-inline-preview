/**
 * Live モードのキーマップ。
 *
 * Obsidian 実測（obsidian-observed-spec.md §4）と、Notion 準拠のショートカット
 * （docs/specifications/notion-shortcuts.md）を合わせて割り当てる。
 * ここで**登録しない**キーが重要な意味を持つ:
 *   - `Backspace` は登録しない。行頭付近でも素の1文字削除に委ねる（記法解除しない）。
 *   - `Mod-z` / `Mod-y` は登録しない。Undo は VS Code 側へ一本化する。
 *
 * webview 内では `editorTextFocus` が偽になり `package.json` のキーバインドが
 * 1 件も届かないため、Live のキーはすべてここで持つ（research/notion-shortcuts.md §4.1）。
 * 一方でキーイベント自体は host へ再ディスパッチされるので、VS Code 既定を黙らせる
 * 負のキーバインドが `package.json` 側に必要になる。
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
import { applyBlockAction, wrapBlockAction } from '../shared/blockActions';
import { nextSelectAllRange } from '../shared/selectAllScope';
import type { SelectionRange } from '../shared/hostSelectAll';
import { getNotionBlockAction, type NotionBlockAction } from '../../shared/notionBlockKeymap';
import { applyInlineFormat, type InlineFormat } from '../../shared/inlineFormat';
import { duplicateBlock, moveBlock, toggleTaskLine, type BlockEdit } from '../../shared/blockOps';
import { enterAdjacentTable } from './liveDecorations';

/**
 * host（拡張本体）へ用があるキー操作の受け口。
 * webview のエントリ（liveApp.ts）が起動時に埋める。
 */
export const liveHostBridge: { switchMode?: (mode: 'raw') => void } = {};

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

    if (action === 'codeBlock' || action === 'toggleList') {
        // コードブロックとトグルリストは行の置換では表せないので、選択範囲ごと包む
        const from = state.doc.line(first).from;
        const to = state.doc.line(last).to;
        const body = state.doc.sliceString(from, to);
        view.dispatch({
            changes: { from, to, insert: wrapBlockAction(body, action) },
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

/**
 * Notion 準拠のインライン書式を当てる（⌘B ⌘I ⌘U ⌘E ⌘⇧S ⌘K ⌘⇧M ⌘⇧H とツールバーから共用）。
 * 文字列の組み立てとカーソル位置の計算は Raw と共通の純関数に任せる。
 */
export function applyInlineFormatToSelection(view: EditorView, format: InlineFormat): boolean {
    const { state } = view;
    const sel = state.selection.main;
    const selected = state.doc.sliceString(sel.from, sel.to);
    // 記号が選択の外側にある場合（囲んだ直後）に外せるよう、前後の行内テキストも渡す
    const line = state.doc.lineAt(sel.from);
    const endLine = state.doc.lineAt(sel.to);
    const r = applyInlineFormat(
        selected,
        format,
        state.doc.sliceString(line.from, sel.from),
        state.doc.sliceString(sel.to, endLine.to)
    );
    const from = sel.from - r.extendBefore;
    const to = sel.to + r.extendAfter;
    view.dispatch({
        changes: { from, to, insert: r.insert },
        selection: { anchor: from + r.selectionStart, head: from + r.selectionEnd },
        userEvent: 'input'
    });
    return true;
}

/** ⌘D: カーソル行（選択範囲）のブロックを子ごと複製する。 */
function liveDuplicateBlock(view: EditorView): boolean {
    return applyBlockEdit(view, (lines, from, to) => duplicateBlock(lines, from, to));
}

/** ⌘⇧↑ / ⌘⇧↓: ブロックを子ごと 1 行分だけ移動する。 */
function liveMoveBlock(view: EditorView, direction: 'up' | 'down'): boolean {
    return applyBlockEdit(view, (lines, from, to) => moveBlock(lines, from, to, direction));
}

/** 純関数が返した「置き換える行範囲と置き換え後テキスト」をそのまま適用する。 */
function applyBlockEdit(
    view: EditorView,
    compute: (lines: string[], from: number, to: number) => BlockEdit | null
): boolean {
    const { state } = view;
    const sel = state.selection.main;
    const lines = state.doc.toString().split('\n');
    // 純関数側は 0 始まり、CodeMirror の行番号は 1 始まり
    const from = state.doc.lineAt(sel.from).number - 1;
    const to = state.doc.lineAt(sel.to).number - 1;
    const edit = compute(lines, from, to);
    if (!edit) return true; // 端で動けない場合も既定動作へは流さない

    const column = sel.head - state.doc.line(state.doc.lineAt(sel.head).number).from;
    const target = state.doc.line(edit.selectionFromLine + 1);
    view.dispatch({
        changes: {
            from: state.doc.line(edit.fromLine + 1).from,
            to: state.doc.line(edit.toLine + 1).to,
            insert: edit.text
        },
        selection: { anchor: target.from + Math.min(column, target.length) },
        scrollIntoView: true,
        userEvent: 'input'
    });
    return true;
}

/** ⌘Enter: カーソル行のチェックボックスを切り替える。 */
function liveToggleTask(view: EditorView): boolean {
    const line = view.state.doc.lineAt(view.state.selection.main.head);
    const next = toggleTaskLine(line.text);
    if (next === null) return false;
    const delta = next.length - line.text.length;
    const head = view.state.selection.main.head;
    view.dispatch({
        changes: { from: line.from, to: line.to, insert: next },
        selection: { anchor: Math.max(line.from, head + delta) },
        userEvent: 'input'
    });
    return true;
}

/**
 * ⇧Enter: ブロック内での改行。
 * Enter と違い、リスト・引用のマーカーを継続しない（Notion の「ブロック内改行」に相当）。
 */
function livePlainNewline(view: EditorView): boolean {
    const sel = view.state.selection.main;
    view.dispatch({
        changes: { from: sel.from, to: sel.to, insert: '\n' },
        selection: { anchor: sel.from + 1 },
        scrollIntoView: true,
        userEvent: 'input'
    });
    return true;
}

/** ⌘⇧.: Raw モードへ切り替える（host に依頼する）。 */
function liveSwitchToRaw(): boolean {
    liveHostBridge.switchMode?.('raw');
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
 * 段階的な ⌘A で最後に設定した選択。
 *
 * host（VS Code 本体）は ⌘A のあと `execCommand('selectAll')` を送ってきて選択を
 * 文書全体へ上書きする。その上書きだけを見分けて捨てるために覚えておく
 * （`src/live/shared/hostSelectAll.ts`）。
 */
let lastSelectAllRange: SelectionRange | null = null;

/** 段階的な ⌘A で最後に設定した選択（未処理なら null）。 */
export function lastLiveSelectAllRange(): SelectionRange | null {
    return lastSelectAllRange;
}

/**
 * ⌘A: 押すたびに選択を広げる。
 * コードフェンスなら 中身 → ブロック全体 → 文書全体、表なら セル → 行 → 表全体 → 文書全体。
 */
export function liveSelectAll(view: EditorView): boolean {
    const sel = view.state.selection.main;
    const next = nextSelectAllRange(view.state.doc.toString(), { from: sel.from, to: sel.to });
    lastSelectAllRange = { from: next.from, to: next.to };
    view.dispatch({ selection: { anchor: next.from, head: next.to } });
    return true;
}

/** Notion 準拠のインライン書式キー（docs/specifications/notion-shortcuts.md §1.1）。 */
const INLINE_FORMAT_KEYS: Readonly<Record<string, InlineFormat>> = {
    'Mod-b': 'bold',
    'Mod-i': 'italic',
    'Mod-u': 'underline',
    'Mod-e': 'code',
    'Mod-k': 'link',
    'Mod-Shift-s': 'strikethrough',
    'Mod-Shift-m': 'comment',
    'Mod-Shift-h': 'highlight'
};

const inlineFormatKeymap: KeyBinding[] = Object.entries(INLINE_FORMAT_KEYS).map(([key, format]) => ({
    key,
    run: (view: EditorView) => applyInlineFormatToSelection(view, format)
}));

export const liveKeymap: KeyBinding[] = [
    { key: 'Mod-a', run: liveSelectAll },
    ...blockKeymap,
    ...inlineFormatKeymap,
    { key: 'Mod-d', run: liveDuplicateBlock },
    { key: 'Mod-Shift-ArrowUp', run: (view) => liveMoveBlock(view, 'up') },
    { key: 'Mod-Shift-ArrowDown', run: (view) => liveMoveBlock(view, 'down') },
    { key: 'Mod-Enter', run: liveToggleTask },
    { key: 'Shift-Enter', run: livePlainNewline },
    { key: 'Mod-Shift-.', run: liveSwitchToRaw },
    { key: 'Enter', run: liveEnter },
    { key: 'Home', run: liveHome },
    // 表はブロックウィジェットなので、既定の移動だと表を丸ごと飛ばす。すぐ下 / 上が表ならセルへ入る
    { key: 'ArrowDown', run: (view) => enterAdjacentTable(view, 'down') },
    { key: 'ArrowUp', run: (view) => enterAdjacentTable(view, 'up') },
    { key: 'Tab', run: liveIndent },
    { key: 'Shift-Tab', run: liveOutdent }
];

/** 引用行かどうか（デコレーション側と判定を揃えるための再エクスポート）。 */
export { parseQuotePrefix };
