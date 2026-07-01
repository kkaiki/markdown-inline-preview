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
    isInTable,
    moveTableRow,
    moveTableColumn,
    selectedRect
} from '@milkdown/prose/tables';
import { Plugin, PluginKey } from '@milkdown/prose/state';
import type { Command } from '@milkdown/prose/state';
import type { ResolvedPos } from '@milkdown/prose/model';
import type { EditorView } from '@milkdown/prose/view';
import { $prose } from '@milkdown/utils';
import { t } from './i18n';

/**
 * 行/列の移動量（ヘッダ行は動かさない）。`null` を返すと no-op。
 * 行はヘッダ（index 0）を固定し、本文行（index >= 1）だけを入れ替える。
 */
export function computeRowMove(view: EditorView, dir: -1 | 1): { from: number; to: number } | null {
    try {
        const rect = selectedRect(view.state);
        const from = rect.top;
        const to = from + dir;
        // from/to ともに本文行（>=1）で、表の範囲内。
        if (from < 1 || to < 1 || to >= rect.map.height) return null;
        return { from, to };
    } catch {
        return null;
    }
}

export function computeColMove(view: EditorView, dir: -1 | 1): { from: number; to: number } | null {
    try {
        const rect = selectedRect(view.state);
        const from = rect.left;
        const to = from + dir;
        if (to < 0 || to >= rect.map.width) return null;
        return { from, to };
    } catch {
        return null;
    }
}

interface ToolbarButton {
    label: string;
    title: string;
    /** 既定の prosemirror-tables コマンド。`run` がある場合はそちらを優先。 */
    command?: Command;
    /** 動的に内容を決める操作（行/列の移動など）。 */
    run?: (view: EditorView) => void;
    danger?: boolean;
}

// label/title は英語ソース（i18n のキー）。表示時に t() で訳す（モジュール読込時は
// まだ言語が未設定のため、ここで t() を呼ばない）。
const BUTTONS: ToolbarButton[] = [
    { label: '+ Row', title: 'Add row below', command: addRowAfter },
    { label: '+ Col', title: 'Add column right', command: addColumnAfter },
    { label: '↑ Row', title: 'Move row up', run: (v) => runRowMove(v, -1) },
    { label: '↓ Row', title: 'Move row down', run: (v) => runRowMove(v, 1) },
    { label: '← Col', title: 'Move column left', run: (v) => runColMove(v, -1) },
    { label: '→ Col', title: 'Move column right', run: (v) => runColMove(v, 1) },
    { label: 'Delete row', title: 'Delete row', command: deleteRow, danger: true },
    { label: 'Delete column', title: 'Delete column', command: deleteColumn, danger: true },
    { label: 'Delete table', title: 'Delete table', command: deleteTable, danger: true }
];

function runRowMove(view: EditorView, dir: -1 | 1): void {
    const move = computeRowMove(view, dir);
    if (!move) return;
    moveTableRow({ from: move.from, to: move.to })(view.state, view.dispatch, view);
}

function runColMove(view: EditorView, dir: -1 | 1): void {
    const move = computeColMove(view, dir);
    if (!move) return;
    moveTableColumn({ from: move.from, to: move.to })(view.state, view.dispatch, view);
}

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
            btn.textContent = t(def.label);
            btn.title = t(def.title);
            if (def.danger) {
                btn.classList.add('danger');
            }
            btn.addEventListener('mousedown', (e) => e.preventDefault());
            btn.addEventListener('click', () => {
                const view = lastView;
                if (!view) return;
                if (def.run) {
                    def.run(view);
                } else if (def.command) {
                    def.command(view.state, view.dispatch, view);
                }
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
