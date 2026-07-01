/**
 * チェックボックス（タスク項目）の チェック/非チェック を切り替える。
 * - `Cmd/Ctrl+Enter` でトグル（このプラグイン）。
 * - クリックでのトグルは list-item-block コンポーネントが担当（フォーカス中もクリックできるよう
 *   CSS で checkbox の label-wrapper を隠さないようにしてある）。
 */
import { Plugin, PluginKey } from '@milkdown/prose/state';
import type { EditorState, Transaction } from '@milkdown/prose/state';
import { $prose } from '@milkdown/utils';

/**
 * カーソルのあるチェックボックス項目の `checked` を反転する transaction を返す。
 * チェックボックス（`checked` が boolean の list_item）でなければ null。
 */
export function toggleCheckboxCheckedTr(state: EditorState): Transaction | null {
    const { $from } = state.selection;
    for (let d = $from.depth; d > 0; d--) {
        const node = $from.node(d);
        if (node.type.name === 'list_item' && typeof node.attrs.checked === 'boolean') {
            const pos = $from.before(d);
            return state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, checked: !node.attrs.checked });
        }
    }
    return null;
}

export function createCheckboxToggleKeymapPlugin() {
    return $prose(() => new Plugin({
        key: new PluginKey('checkboxToggle'),
        props: {
            handleKeyDown(view, event) {
                if (event.key !== 'Enter') return false;
                if (!(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey) return false;
                const tr = toggleCheckboxCheckedTr(view.state);
                if (!tr) return false; // チェックボックス外は既定（gfm の ExitTable など）へ
                view.dispatch(tr);
                event.preventDefault();
                return true;
            }
        }
    }));
}
