/**
 * テーブルのセル内で Enter を押したとき、gfm 既定の挙動（exitTable = テーブルの
 * 下に新しい段落を作る）ではなく、セル内に改行（hardbreak）を入れる。
 *
 * GFM ではセル内の改行は `<br>` として表現される（table_cell は単一段落のため
 * リテラル改行は使えない）。このプラグインは gfm の keymap より前に挿入して
 * Enter を横取りする必要がある。
 */
import { Plugin, PluginKey } from '@milkdown/prose/state';
import type { EditorState } from '@milkdown/prose/state';
import { $prose } from '@milkdown/utils';

function isInTableCell(state: EditorState): boolean {
    const { $from } = state.selection;
    for (let depth = $from.depth; depth > 0; depth--) {
        const name = $from.node(depth).type.name;
        if (name === 'table_cell' || name === 'table_header') return true;
    }
    return false;
}

export function createTableCellEnterPlugin() {
    return $prose(() => {
        return new Plugin({
            key: new PluginKey('tableCellEnter'),
            props: {
                handleKeyDown(view, event) {
                    if (event.key !== 'Enter') return false;
                    if (event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return false;

                    const { state } = view;
                    if (!isInTableCell(state)) return false;

                    const hardbreak = state.schema.nodes.hardbreak;
                    if (!hardbreak) return false;

                    const tr = state.tr.replaceSelectionWith(hardbreak.create()).scrollIntoView();
                    view.dispatch(tr);
                    event.preventDefault();
                    return true;
                }
            }
        });
    });
}
