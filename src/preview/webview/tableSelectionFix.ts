/**
 * 表境界をまたぐ範囲選択（Shift+↑/↓ などで表の外から中へ伸ばした選択）を、
 * 「表全体を含む」形に正規化するプラグイン。
 *
 * 背景: prosemirror-tables の `tableEditing`（`appendTransaction` 内の `normalizeSelection`）は、
 * 表の外→中をまたぐ `TextSelection` を検知すると `isTextSelectionAcrossCells` /
 * `isCellBoundarySelection` に当てて **最初のセルだけにスナップ**したり **collapse** したりする。
 * その結果、表の上の段落から Shift+↓ で選択を広げると、表に入った瞬間に選択が壊れる。
 *
 * 対策: 片方の端点だけが表の中にある（＝表境界をまたぐ）`TextSelection` を、
 * 内側の端点を「相手の端点から見て表の向こう側」へスナップし、**表全体を含む**選択にする。
 * こうするとスナップ後は両端が表の外（or 隣接ブロック先頭/末尾）になり、tables 側の正規化
 * 条件に当たらなくなるため破壊されない。さらに Shift を続ければ表の先（次/前ブロック）へ
 * 自然に伸びる。
 *
 * このプラグインは **gfm（tables）より前**に挿入する必要がある。appendTransaction は配列順に
 * 実行され、先に走ったプラグインの結果を後続が見るため、ここで先に正規化しておけば tables の
 * normalizeSelection はそれを「またいでいない選択」と見なして触らない。
 */
import { Plugin, PluginKey, Selection, TextSelection } from '@milkdown/prose/state';
import type { EditorState } from '@milkdown/prose/state';
import type { ResolvedPos } from '@milkdown/prose/model';
import { $prose } from '@milkdown/utils';

/** $pos が表（tableRole === 'table'）の中にあれば、その表の範囲を返す。なければ null。 */
function tableRangeAt($pos: ResolvedPos): { before: number; after: number } | null {
    for (let depth = $pos.depth; depth > 0; depth--) {
        if ($pos.node(depth).type.spec.tableRole === 'table') {
            return { before: $pos.before(depth), after: $pos.after(depth) };
        }
    }
    return null;
}

/**
 * 表境界をまたぐ `TextSelection` を「表全体を含む」選択へ正規化して返す。
 * 対象でなければ（またいでいない／CellSelection／カーソルのみ等）`null`。
 *
 * - 片方の端点だけが表の中にある場合のみ対象（XOR）。両端が同じ表の中なら tables が
 *   CellSelection 化するので触らない。
 * - 内側の端点を、相手の端点から見て表の向こう側（下方向なら表の直後、上方向なら直前）の
 *   最も近い選択可能なインライン位置へスナップする。
 * - anchor / head の役割（選択の向き）は維持する。
 */
export function fixTableCrossingSelection(state: EditorState): Selection | null {
    const sel = state.selection;
    if (!(sel instanceof TextSelection)) return null; // CellSelection 等は tables に任せる
    if (sel.empty) return null; // 範囲選択のみ対象（カーソル移動は対象外）

    const { doc } = state;
    const { $anchor, $head } = sel;
    const anchorTable = tableRangeAt($anchor);
    const headTable = tableRangeAt($head);

    // 片方だけが表の中（XOR）かを判定。両方とも外 / 両方とも（同一）表の中なら対象外。
    const insideIsHead = !!headTable && !anchorTable;
    const insideIsAnchor = !!anchorTable && !headTable;
    if (!insideIsHead && !insideIsAnchor) return null;

    const range = insideIsHead ? headTable : anchorTable;
    if (!range) return null;
    const insidePos = insideIsHead ? $head.pos : $anchor.pos;
    const outsidePos = insideIsHead ? $anchor.pos : $head.pos;

    // 内側端点が外側端点より下（pos 大）なら表の後ろへ、上なら表の前へスナップする。
    const goingDown = insidePos > outsidePos;
    const boundary = goingDown ? range.after : range.before;

    // boundary は表ノードの直前/直後（テキスト位置ではない）なので、最も近い選択可能な
    // インライン位置を求める（下方向＝次ブロック先頭、上方向＝前ブロック末尾）。
    let endpoint = Selection.near(doc.resolve(boundary), goingDown ? 1 : -1).head;

    // 表が文書末尾/先頭で隣接ブロックが無く、endpoint が表の中へ戻ってしまう場合は、
    // 表の最終セル末尾/先頭セル先頭へフォールバックして「表全体」を含める。
    if (tableRangeAt(doc.resolve(endpoint))) {
        endpoint = goingDown ? range.after - 1 : range.before + 1;
    }

    const newAnchor = insideIsHead ? outsidePos : endpoint;
    const newHead = insideIsHead ? endpoint : outsidePos;

    // 変化が無ければループ防止で null（既に正規化済み）。
    if (newAnchor === sel.anchor && newHead === sel.head) return null;

    try {
        return TextSelection.create(doc, newAnchor, newHead);
    } catch {
        return null;
    }
}

export function createTableSelectionFixPlugin() {
    return $prose(() => {
        return new Plugin({
            key: new PluginKey('tableSelectionFix'),
            appendTransaction(transactions, _oldState, newState) {
                // 選択 or 文書が変わった時だけ評価する。
                if (!transactions.some((tr) => tr.selectionSet || tr.docChanged)) return null;
                const fixed = fixTableCrossingSelection(newState);
                if (!fixed) return null;
                // scrollIntoView はしない（意図しない先頭/末尾への巻き戻しを避ける）。
                return newState.tr.setSelection(fixed);
            }
        });
    });
}
