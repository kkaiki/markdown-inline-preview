/**
 * テーブルのグリップ（行は左端・列は上端）をクリックして行/列を選択したときに、
 * ラベル付きの操作メニュー（行/列の追加・削除・整列）を表示するプラグイン。
 *
 * Milkdown tableBlock 標準のアイコンのみのツールバー（常時表示ぎみで分かりにくい）は
 * CSS で隠し、こちらの明示的なメニューに置き換える。
 */
import { commandsCtx, editorViewCtx } from '@milkdown/kit/core';
import type { CmdKey } from '@milkdown/kit/core';
import type { Ctx } from '@milkdown/ctx';
import { Plugin, PluginKey } from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';
import { CellSelection } from '@milkdown/prose/tables';
import { posToDOMRect } from '@milkdown/prose';
import { $prose } from '@milkdown/utils';
import {
    addColAfterCommand,
    addColBeforeCommand,
    addRowAfterCommand,
    addRowBeforeCommand,
    deleteSelectedCellsCommand,
    setAlignCommand
} from '@milkdown/kit/preset/gfm';

type MenuKind = 'row' | 'col';

interface ActionItem {
    icon: string;
    label: string;
    danger?: boolean;
    run: () => void;
}

class TableActionMenu {
    private readonly ctx: Ctx;
    private readonly el: HTMLDivElement;
    private renderedKind: MenuKind | null = null;

    constructor(ctx: Ctx) {
        this.ctx = ctx;
        this.el = document.createElement('div');
        this.el.className = 'table-action-menu';
        this.el.setAttribute('role', 'menu');
        this.el.hidden = true;
        // クリックでエディタのセル選択が外れないように mousedown を抑止する
        this.el.addEventListener('mousedown', (e) => e.preventDefault());
        document.body.appendChild(this.el);
    }

    update(view: EditorView): void {
        const sel = view.state.selection;
        if (!view.editable || !(sel instanceof CellSelection)) {
            this.hide();
            return;
        }

        const kind: MenuKind = sel.isColSelection() ? 'col' : sel.isRowSelection() ? 'row' : 'col';
        if (!sel.isColSelection() && !sel.isRowSelection()) {
            this.hide();
            return;
        }

        if (this.renderedKind !== kind) {
            this.render(kind);
            this.renderedKind = kind;
        }
        this.position(view, sel, kind);
        this.el.hidden = false;
    }

    private runCommand<T>(key: CmdKey<T>, payload?: T): void {
        this.ctx.get(commandsCtx).call(key, payload);
        requestAnimationFrame(() => this.ctx.get(editorViewCtx).focus());
    }

    private buildItems(kind: MenuKind): ActionItem[] {
        if (kind === 'col') {
            return [
                { icon: '⊞', label: '左に列を追加', run: () => this.runCommand(addColBeforeCommand.key) },
                { icon: '⊞', label: '右に列を追加', run: () => this.runCommand(addColAfterCommand.key) },
                { icon: '🗑', label: '列を削除', danger: true, run: () => this.runCommand(deleteSelectedCellsCommand.key) }
            ];
        }
        return [
            { icon: '⊞', label: '上に行を追加', run: () => this.runCommand(addRowBeforeCommand.key) },
            { icon: '⊞', label: '下に行を追加', run: () => this.runCommand(addRowAfterCommand.key) },
            { icon: '🗑', label: '行を削除', danger: true, run: () => this.runCommand(deleteSelectedCellsCommand.key) }
        ];
    }

    private render(kind: MenuKind): void {
        this.el.replaceChildren();

        const items = this.buildItems(kind);
        items.forEach((item, index) => {
            if (item.danger && index > 0) this.el.appendChild(this.separator());
            this.el.appendChild(this.actionButton(item));
        });

        if (kind === 'col') {
            this.el.appendChild(this.separator());
            this.el.appendChild(this.alignRow());
        }
    }

    private actionButton(item: ActionItem): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.type = 'button';
        if (item.danger) btn.classList.add('danger');
        const icon = document.createElement('span');
        icon.className = 'tam-icon';
        icon.textContent = item.icon;
        const label = document.createElement('span');
        label.textContent = item.label;
        btn.append(icon, label);
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            item.run();
        });
        return btn;
    }

    private alignRow(): HTMLDivElement {
        const row = document.createElement('div');
        row.className = 'tam-align-row';
        const aligns: Array<{ label: string; value: 'left' | 'center' | 'right' }> = [
            { label: '⇤', value: 'left' },
            { label: '≡', value: 'center' },
            { label: '⇥', value: 'right' }
        ];
        for (const a of aligns) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.title = `${a.value} 揃え`;
            btn.textContent = a.label;
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                this.runCommand(setAlignCommand.key, a.value);
            });
            row.appendChild(btn);
        }
        return row;
    }

    private separator(): HTMLDivElement {
        const sep = document.createElement('div');
        sep.className = 'tam-sep';
        return sep;
    }

    private position(view: EditorView, sel: CellSelection, kind: MenuKind): void {
        const rect = posToDOMRect(view, sel.from, sel.to);
        // 一度表示してサイズを測ってから配置する
        this.el.hidden = false;
        const mh = this.el.offsetHeight;
        const mw = this.el.offsetWidth;

        let top: number;
        let left: number;
        if (kind === 'col') {
            top = rect.top - mh - 6;
            left = rect.left;
            if (top < 4) top = rect.bottom + 6;
        } else {
            left = rect.left - mw - 6;
            top = rect.top;
            if (left < 4) {
                left = rect.left;
                top = rect.bottom + 6;
            }
        }
        left = Math.max(4, Math.min(left, window.innerWidth - mw - 4));
        top = Math.max(4, Math.min(top, window.innerHeight - mh - 4));
        this.el.style.left = `${left}px`;
        this.el.style.top = `${top}px`;
    }

    private hide(): void {
        if (this.el.hidden) return;
        this.el.hidden = true;
        this.renderedKind = null;
    }

    destroy(): void {
        this.el.remove();
    }
}

export function createTableMenuPlugin() {
    return $prose((ctx) => {
        const menu = new TableActionMenu(ctx);
        return new Plugin({
            key: new PluginKey('tableActionMenu'),
            view: (view) => {
                menu.update(view);
                return {
                    update: (updatedView) => menu.update(updatedView),
                    destroy: () => menu.destroy()
                };
            }
        });
    });
}
