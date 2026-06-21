/**
 * 標準テーブル（prosemirror-tables）用の軽量ツールバー。
 *
 * `tableBlock` コンポーネントは使わず（クリックで NodeSelection を作りカーソルが
 * 見えなくなる/Cmd+A が壊れるため）、カーソルがテーブル内にある間だけ、テーブルの
 * 右上に「行/列の追加・削除」ボタンをフロート表示する（document.body 上のオーバーレイ）。
 */
import {
    addRowAfter,
    addColumnAfter,
    deleteRow,
    deleteColumn,
    deleteTable,
    isInTable
} from '@milkdown/prose/tables';
import { Plugin, PluginKey } from '@milkdown/prose/state';
import type { Command } from '@milkdown/prose/state';
import type { ResolvedPos } from '@milkdown/prose/model';
import type { EditorView } from '@milkdown/prose/view';
import { $prose } from '@milkdown/utils';

interface ToolbarButton {
    label: string;
    title: string;
    command: Command;
}

const BUTTONS: ToolbarButton[] = [
    { label: '＋行', title: '下に行を追加', command: addRowAfter },
    { label: '＋列', title: '右に列を追加', command: addColumnAfter },
    { label: '行を削除', title: '行を削除', command: deleteRow },
    { label: '列を削除', title: '列を削除', command: deleteColumn },
    { label: '表を削除', title: '表を削除', command: deleteTable }
];

function tableDepth($pos: ResolvedPos): number {
    for (let depth = $pos.depth; depth > 0; depth--) {
        if ($pos.node(depth).type.spec.tableRole === 'table') return depth;
    }
    return -1;
}

export function createTableToolbarPlugin() {
    return $prose(() => {
        const bar = document.createElement('div');
        bar.className = 'table-toolbar';
        bar.hidden = true;

        let lastView: EditorView | null = null;
        let currentTablePos = -1;

        for (const def of BUTTONS) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = def.label;
            btn.title = def.title;
            if (def.command === deleteRow || def.command === deleteColumn || def.command === deleteTable) {
                btn.classList.add('danger');
            }
            btn.addEventListener('mousedown', (e) => e.preventDefault());
            btn.addEventListener('click', () => {
                const view = lastView;
                if (!view) return;
                def.command(view.state, view.dispatch, view);
                requestAnimationFrame(() => {
                    view.focus();
                    reposition();
                });
            });
            bar.appendChild(btn);
        }
        document.body.appendChild(bar);

        function reposition(): void {
            const view = lastView;
            if (!view || currentTablePos < 0) {
                bar.hidden = true;
                return;
            }
            const dom = view.nodeDOM(currentTablePos);
            const el = dom instanceof HTMLElement ? (dom.closest('table') ?? dom) : null;
            if (!el) {
                bar.hidden = true;
                return;
            }
            const rect = el.getBoundingClientRect();
            bar.hidden = false;
            bar.style.top = `${Math.max(4, rect.top - bar.offsetHeight - 4)}px`;
            bar.style.left = `${rect.left}px`;
        }

        function sync(view: EditorView): void {
            lastView = view;
            try {
                if (!view.editable || !isInTable(view.state)) {
                    currentTablePos = -1;
                    bar.hidden = true;
                    return;
                }
                const $from = view.state.selection.$from;
                const depth = tableDepth($from);
                currentTablePos = depth > 0 ? $from.before(depth) : -1;
                reposition();
            } catch {
                currentTablePos = -1;
                bar.hidden = true;
            }
        }

        return new Plugin({
            key: new PluginKey('tableToolbar'),
            view: (view) => {
                const root = document.getElementById('milkdown-root');
                const onScroll = (): void => reposition();
                root?.addEventListener('scroll', onScroll, true);
                sync(view);
                return {
                    update: (v) => sync(v),
                    destroy: () => {
                        root?.removeEventListener('scroll', onScroll, true);
                        bar.remove();
                    }
                };
            }
        });
    });
}
