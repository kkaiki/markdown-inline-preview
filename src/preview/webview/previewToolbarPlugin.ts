/**
 * Preview（Milkdown WYSIWYG）上部に固定表示するツールバー。
 *
 * マウスだけで見出し・チェックボックス・番号付きリストを適用できるようにする。
 * 各ボタンはホバーで「機能名 + ショートカット」を表示。右端の Export ボタンは
 * ホスト（previewPanel）へ exportRequest を投げ、Pro 課金導線につなぐ。
 *
 * 設計: docs/specifications/preview-toolbar.md
 * アイコン候補: docs/preview-toggle-icon-candidates.md
 */
import { Plugin, PluginKey } from '@milkdown/prose/state';
import type { EditorState } from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';
import type { NodeType } from '@milkdown/prose/model';
import { setBlockType } from '@milkdown/prose/commands';
import { wrapInList } from '@milkdown/prose/schema-list';
import { $prose } from '@milkdown/utils';

export interface PreviewToolbarOptions {
    isMac: boolean;
    showShortcuts: boolean;
    onExport: () => void;
}

interface ToolbarItem {
    id: string;
    label: string;
    title: string;
    shortcutMac?: string;
    shortcutWin?: string;
    run: (view: EditorView) => void;
    /** 現在ブロックがこの項目に一致するか（アクティブ強調用） */
    isActive?: (state: EditorState) => boolean;
}

function findListItemDepth(state: EditorState, listItem: NodeType): number {
    const { $from } = state.selection;
    for (let depth = $from.depth; depth > 0; depth--) {
        if ($from.node(depth).type === listItem) return depth;
    }
    return -1;
}

function toggleHeading(view: EditorView, level: number): void {
    const { schema, selection } = view.state;
    const heading = schema.nodes.heading;
    const paragraph = schema.nodes.paragraph;
    if (!heading || !paragraph) return;
    const parent = selection.$from.parent;
    const cmd =
        parent.type === heading && parent.attrs.level === level
            ? setBlockType(paragraph)
            : setBlockType(heading, { level });
    cmd(view.state, view.dispatch, view);
    view.focus();
}

function toggleOrderedList(view: EditorView): void {
    const orderedList = view.state.schema.nodes.ordered_list;
    if (!orderedList) return;
    wrapInList(orderedList)(view.state, view.dispatch, view);
    view.focus();
}

/** 現在行をチェックボックス（タスク項目）にする/解除する。 */
function toggleCheckbox(view: EditorView): void {
    const { schema } = view.state;
    const listItem = schema.nodes.list_item;
    const bulletList = schema.nodes.bullet_list;
    if (!listItem || !bulletList) return;

    let depth = findListItemDepth(view.state, listItem);
    if (depth < 0) {
        // リスト外なら、まず箇条書きに包んでから list_item を取り直す。
        if (!wrapInList(bulletList)(view.state, view.dispatch, view)) {
            view.focus();
            return;
        }
        depth = findListItemDepth(view.state, listItem);
        if (depth < 0) {
            view.focus();
            return;
        }
    }

    const { $from } = view.state.selection;
    const li = $from.node(depth);
    const pos = $from.before(depth);
    // checked == null は通常のリスト項目。トグルで false(未チェックのタスク) と往復する。
    const nextChecked = li.attrs.checked === null ? false : null;
    view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...li.attrs, checked: nextChecked }));
    view.focus();
}

function headingActive(level: number) {
    return (state: EditorState): boolean => {
        const heading = state.schema.nodes.heading;
        const parent = state.selection.$from.parent;
        return !!heading && parent.type === heading && parent.attrs.level === level;
    };
}

function checkboxActive(state: EditorState): boolean {
    const listItem = state.schema.nodes.list_item;
    if (!listItem) return false;
    const depth = findListItemDepth(state, listItem);
    if (depth < 0) return false;
    return state.selection.$from.node(depth).attrs.checked !== null;
}

function orderedActive(state: EditorState): boolean {
    const orderedList = state.schema.nodes.ordered_list;
    if (!orderedList) return false;
    const { $from } = state.selection;
    for (let depth = $from.depth; depth > 0; depth--) {
        if ($from.node(depth).type === orderedList) return true;
    }
    return false;
}

export function createPreviewToolbarPlugin(options: PreviewToolbarOptions) {
    const items: ToolbarItem[] = [
        { id: 'h1', label: 'H1', title: '見出し 1', shortcutMac: '⌥⌘1', shortcutWin: 'Alt+Ctrl+1', run: (v) => toggleHeading(v, 1), isActive: headingActive(1) },
        { id: 'h2', label: 'H2', title: '見出し 2', shortcutMac: '⌥⌘2', shortcutWin: 'Alt+Ctrl+2', run: (v) => toggleHeading(v, 2), isActive: headingActive(2) },
        { id: 'h3', label: 'H3', title: '見出し 3', shortcutMac: '⌥⌘3', shortcutWin: 'Alt+Ctrl+3', run: (v) => toggleHeading(v, 3), isActive: headingActive(3) },
        { id: 'checkbox', label: '☑', title: 'チェックボックス', shortcutMac: '⌥⌘4', shortcutWin: 'Alt+Ctrl+4', run: toggleCheckbox, isActive: checkboxActive },
        { id: 'numbered', label: '1.', title: '番号付きリスト', shortcutMac: '⌥⌘6', shortcutWin: 'Alt+Ctrl+6', run: toggleOrderedList, isActive: orderedActive }
    ];

    return $prose(() => {
        const bar = document.createElement('div');
        bar.className = 'preview-toolbar';

        // ホバー用ツールチップ（機能名 + ショートカット）。1 つを使い回す。
        const tooltip = document.createElement('div');
        tooltip.className = 'preview-toolbar-tooltip';
        tooltip.hidden = true;
        document.body.appendChild(tooltip);

        let lastView: EditorView | null = null;

        const shortcutOf = (item: ToolbarItem): string =>
            (options.isMac ? item.shortcutMac : item.shortcutWin) ?? '';

        const showTooltip = (anchor: HTMLElement, text: string, shortcut: string): void => {
            tooltip.textContent = '';
            const labelSpan = document.createElement('span');
            labelSpan.textContent = text;
            tooltip.appendChild(labelSpan);
            if (options.showShortcuts && shortcut) {
                const keySpan = document.createElement('span');
                keySpan.className = 'preview-toolbar-key';
                keySpan.textContent = shortcut;
                tooltip.appendChild(keySpan);
            }
            tooltip.hidden = false;
            const rect = anchor.getBoundingClientRect();
            tooltip.style.left = `${Math.round(rect.left)}px`;
            tooltip.style.top = `${Math.round(rect.bottom + 6)}px`;
        };
        const hideTooltip = (): void => {
            tooltip.hidden = true;
        };

        const buttonMap = new Map<string, HTMLButtonElement>();

        const wireHover = (btn: HTMLButtonElement, title: string, shortcut: string): void => {
            btn.addEventListener('mouseenter', () => showTooltip(btn, title, shortcut));
            btn.addEventListener('mouseleave', hideTooltip);
            btn.addEventListener('mousedown', (e) => e.preventDefault());
        };

        for (const item of items) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'preview-toolbar-btn';
            btn.textContent = item.label;
            btn.setAttribute('aria-label', item.title);
            wireHover(btn, item.title, shortcutOf(item));
            btn.addEventListener('click', () => {
                if (lastView) item.run(lastView);
            });
            bar.appendChild(btn);
            buttonMap.set(item.id, btn);
        }

        // 右端: Export（Pro 導線）
        const spacer = document.createElement('div');
        spacer.className = 'preview-toolbar-spacer';
        bar.appendChild(spacer);

        const exportBtn = document.createElement('button');
        exportBtn.type = 'button';
        exportBtn.className = 'preview-toolbar-btn preview-toolbar-export';
        exportBtn.textContent = 'Export';
        exportBtn.setAttribute('aria-label', 'PDF / Marp で書き出す（Pro）');
        wireHover(exportBtn, 'PDF / Marp で書き出す（Pro）', '');
        exportBtn.addEventListener('click', () => options.onExport());
        bar.appendChild(exportBtn);

        const updateActive = (state: EditorState): void => {
            for (const item of items) {
                const btn = buttonMap.get(item.id);
                if (!btn) continue;
                btn.classList.toggle('active', !!item.isActive?.(state));
            }
        };

        return new Plugin({
            key: new PluginKey('previewToolbar'),
            view: (view) => {
                lastView = view;
                const mount = document.getElementById('milkdown-root');
                if (mount) {
                    mount.insertBefore(bar, mount.firstChild);
                }
                updateActive(view.state);
                return {
                    update: (v) => {
                        lastView = v;
                        updateActive(v.state);
                    },
                    destroy: () => {
                        bar.remove();
                        tooltip.remove();
                    }
                };
            }
        });
    });
}
