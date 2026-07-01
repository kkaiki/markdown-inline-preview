/**
 * 表セル内での ↑/↓（縦移動）を「同じ列の上下のセル」へ移すキーマップ。
 *
 * gfm（prosemirror-tables）は Tab/Enter しか割り当てておらず、↑/↓ はブラウザの素の
 * キャレット移動に任される。すると単一行セルで ↓ を押したとき、真下のセルではなく
 * 右のセルへ飛んでしまう（DOM 上の読み順に流れる）。ここで prosemirror-tables 標準の
 * 「セル端なら隣のセルへ」ロジック（`nextCell`）を入れて、↓ は真下のセル、↑ は真上の
 * セルへ移す。セルの途中（複数行セル）では既定のキャレット移動に委ねる（`endOfTextblock`）。
 *
 * Shift などの修飾付き（範囲選択など）は対象外にして、選択拡張（tableSelectionFix）や
 * 既定挙動を壊さない。
 */
import { Plugin, PluginKey, Selection, TextSelection } from '@milkdown/prose/state';
import type { EditorState, Selection as PMSelection } from '@milkdown/prose/state';
import { CellSelection, nextCell } from '@milkdown/prose/tables';
import type { EditorView } from '@milkdown/prose/view';
import { $prose } from '@milkdown/utils';

/** カーソルのあるセルの depth（tableRole が cell/header_cell）。無ければ -1。 */
function cellDepthOf(state: EditorState): number {
    const { $head } = state.selection;
    for (let d = $head.depth; d > 0; d--) {
        const role = $head.node(d).type.spec.tableRole;
        if (role === 'cell' || role === 'header_cell') return d;
    }
    return -1;
}

/**
 * 表セル内で縦移動（dir=1: 下 / dir=-1: 上）したときの移動先選択を返す。
 * - 同じ列の隣のセルがあればそこへ。
 * - 無ければ（端の行）表の外（直後/直前）へ抜ける。
 * - 表の中でなければ null。
 *
 * ※「セルの端にいるか（endOfTextblock）」の判定は含まない。呼び出し側（handleKeyDown）で
 *   端のときだけこれを使う。こうしてレイアウト依存を切り離し、ユニットテストできるようにする。
 */
export function tableCellVerticalTarget(state: EditorState, dir: 1 | -1): PMSelection | null {
    const cellDepth = cellDepthOf(state);
    if (cellDepth < 0) return null;

    const { $head } = state.selection;
    const $cell = state.doc.resolve($head.before(cellDepth));
    const $next = nextCell($cell, 'vert', dir);
    if ($next) return Selection.near($next, 1);

    // その方向に隣のセルが無い（端の行）→ 表の外へ抜ける。
    let tableDepth = -1;
    for (let d = $head.depth; d > 0; d--) {
        if ($head.node(d).type.spec.tableRole === 'table') { tableDepth = d; break; }
    }
    if (tableDepth < 0) return null;
    const boundary = dir > 0 ? $head.after(tableDepth) : $head.before(tableDepth);
    return Selection.near(state.doc.resolve(boundary), dir);
}

/** カーソルがセルの「その方向の端」にあるか（複数行セルの途中なら false）。 */
function atCellEdge(view: EditorView, dir: 1 | -1): boolean {
    const { selection } = view.state;
    if (!(selection instanceof TextSelection)) return false;
    const { $head } = selection;
    for (let d = $head.depth - 1; d >= 0; d--) {
        const parent = $head.node(d);
        const index = dir < 0 ? $head.index(d) : $head.indexAfter(d);
        if (index !== (dir < 0 ? 0 : parent.childCount)) return false;
        const role = parent.type.spec.tableRole;
        if (role === 'cell' || role === 'header_cell') {
            return view.endOfTextblock(dir > 0 ? 'down' : 'up');
        }
    }
    return false;
}

function handleVerticalArrow(view: EditorView, dir: 1 | -1): boolean {
    const { state } = view;
    const sel = state.selection;

    // 複数セル選択中に ↑/↓ → ヘッドセル側へ collapse して移動。
    if (sel instanceof CellSelection) {
        const target = tableCellVerticalTarget(state, dir)
            ?? Selection.near(sel.$headCell, dir);
        view.dispatch(state.tr.setSelection(target).scrollIntoView());
        return true;
    }

    // セル外なら処理しない。
    if (cellDepthOf(state) < 0) return false;

    // テキスト選択（non-empty）の場合、まずセル内カーソルへ collapse したうえで
    // セル境界判定を行う。そのままブラウザに任せると列がずれて別列へ飛ぶため。
    if (!sel.empty) {
        const target = tableCellVerticalTarget(state, dir);
        if (!target) return false;
        view.dispatch(state.tr.setSelection(target).scrollIntoView());
        return true;
    }

    if (!atCellEdge(view, dir)) return false; // セルの途中なら既定のキャレット移動

    const target = tableCellVerticalTarget(state, dir);
    if (!target) return false;
    view.dispatch(state.tr.setSelection(target).scrollIntoView());
    return true;
}

export function createTableArrowKeymapPlugin() {
    return $prose(() => new Plugin({
        key: new PluginKey('tableArrowKeymap'),
        props: {
            handleKeyDown(view, event) {
                // 修飾キー付き（Shift 範囲選択・Cmd など）は対象外。
                if (event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return false;
                if (event.key === 'ArrowDown') return handleVerticalArrow(view, 1);
                if (event.key === 'ArrowUp') return handleVerticalArrow(view, -1);
                return false;
            }
        }
    }));
}
