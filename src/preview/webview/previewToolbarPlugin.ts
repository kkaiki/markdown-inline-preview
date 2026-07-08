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
import type { Ctx } from '@milkdown/ctx';
import { setBlockType } from '@milkdown/prose/commands';
import { liftListItem } from '@milkdown/prose/schema-list';
import { commandsCtx } from '@milkdown/kit/core';
import { createCodeBlockCommand, wrapInBlockquoteCommand } from '@milkdown/kit/preset/commonmark';
import { undoCommand, redoCommand } from '@milkdown/kit/plugin/history';
import { insertTableCommand } from '@milkdown/kit/preset/gfm';
import { $prose } from '@milkdown/utils';
import { applyListType, wrapInBulletListAndSetChecked } from './previewKeymapPlugin';
import { setBlockPrefixExpansionSuppressed, collapseCurrentExpandedBlock } from './blockPrefixEditPlugin';
import { t } from './i18n';

/** 3×3 のテーブルを表すアイコン（ツールバーのボタン用）。 */
const TABLE_ICON_SVG =
    '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">' +
    '<rect x="1.5" y="2.5" width="13" height="11" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.2"/>' +
    '<path d="M1.5 6.5H14.5M1.5 10H14.5M6 2.5V13.5M10 2.5V13.5" fill="none" stroke="currentColor" stroke-width="1.1"/>' +
    '</svg>';

/** コードブロック `</>` を表すアイコン。 */
const CODE_ICON_SVG =
    '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">' +
    '<path d="M6 4.5L2.5 8L6 11.5M10 4.5L13.5 8L10 11.5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>' +
    '</svg>';

/** 引用（blockquote）を表すアイコン（左の縦バー＋本文行）。 */
const QUOTE_ICON_SVG =
    '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">' +
    '<rect x="2.5" y="3.5" width="2" height="9" rx="1" fill="currentColor"/>' +
    '<path d="M7 5.5H13.5M7 8H13.5M7 10.5H11" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>' +
    '</svg>';

export interface PreviewToolbarOptions {
    isMac: boolean;
    showShortcuts: boolean;
    onExport: () => void;
    onToggleRaw: () => void;
    /** 拡大。新しいズーム率（%）を返す。 */
    onZoomIn: () => number;
    /** 縮小。新しいズーム率（%）を返す。 */
    onZoomOut: () => number;
    /** 100% に戻す。新しいズーム率（%）を返す。 */
    onZoomReset: () => number;
    /** 初期ズーム率（%）。 */
    initialZoom: number;
}

interface ToolbarItem {
    id: string;
    label: string;
    /** label を HTML（SVG アイコン）として描画するか。既定はテキスト。 */
    labelIsHtml?: boolean;
    title: string;
    shortcutMac?: string;
    shortcutWin?: string;
    run: (view: EditorView, ctx: Ctx) => void;
    /** 現在ブロックがこの項目に一致するか（アクティブ強調用） */
    isActive?: (state: EditorState) => boolean;
    /** このボタンの後ろに区切り線を入れる。 */
    separatorAfter?: boolean;
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

/** 見出しは list_item に入れられないため、リスト化の前に段落へ落とす。 */
function demoteHeadingToParagraph(view: EditorView): void {
    const { schema, selection } = view.state;
    const heading = schema.nodes.heading;
    const paragraph = schema.nodes.paragraph;
    if (!heading || !paragraph) return;
    if (selection.$from.parent.type !== heading) return;
    setBlockType(paragraph)(view.state, view.dispatch, view);
}

/** list_item の checked 属性を設定する。 */
function setChecked(view: EditorView, depth: number, checked: boolean): void {
    const { $from } = view.state.selection;
    const li = $from.node(depth);
    const pos = $from.before(depth);
    view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...li.attrs, checked }));
}

function toggleBulletList(view: EditorView): void {
    // 見出しからでも箇条書きにできるよう、先に段落へ落とす。
    demoteHeadingToParagraph(view);
    // 箇条書き⇄番号付きの相互変換や解除も扱う共通ヘルパに委ねる。
    applyListType(view, 'bullet');
}

function toggleOrderedList(view: EditorView): void {
    demoteHeadingToParagraph(view);
    // 箇条書き⇄番号付きの相互変換や解除も扱う共通ヘルパに委ねる。
    applyListType(view, 'ordered');
}

/** カーソル位置に 3×3 のテーブルを挿入する。 */
function insertTable(view: EditorView, ctx: Ctx): void {
    ctx.get(commandsCtx).call(insertTableCommand.key, { row: 3, col: 3 });
    view.focus();
}

/** 現在ブロックをコードブロックにする（```）。 */
function insertCodeBlock(view: EditorView, ctx: Ctx): void {
    ctx.get(commandsCtx).call(createCodeBlockCommand.key);
    view.focus();
}

/** 現在ブロックを引用（blockquote）で囲む。 */
function toggleQuote(view: EditorView, ctx: Ctx): void {
    ctx.get(commandsCtx).call(wrapInBlockquoteCommand.key);
    view.focus();
}

/** 取り消し（Undo）。Cmd/Ctrl+Z と同じ。 */
function undo(view: EditorView, ctx: Ctx): void {
    ctx.get(commandsCtx).call(undoCommand.key);
    view.focus();
}

/** やり直し（Redo）。Cmd/Ctrl+Shift+Z と同じ。 */
function redo(view: EditorView, ctx: Ctx): void {
    ctx.get(commandsCtx).call(redoCommand.key);
    view.focus();
}

function codeBlockActive(state: EditorState): boolean {
    const codeBlock = state.schema.nodes.code_block;
    return !!codeBlock && state.selection.$from.parent.type === codeBlock;
}

function blockquoteActive(state: EditorState): boolean {
    const blockquote = state.schema.nodes.blockquote;
    if (!blockquote) return false;
    const { $from } = state.selection;
    for (let depth = $from.depth; depth > 0; depth--) {
        if ($from.node(depth).type === blockquote) return true;
    }
    return false;
}

/** 現在行をチェックボックス（タスク項目）にする / 解除して何もない段落へ戻す。 */
function toggleCheckbox(view: EditorView): void {
    const { schema } = view.state;
    const listItem = schema.nodes.list_item;
    const bulletList = schema.nodes.bullet_list;
    if (!listItem || !bulletList) return;

    // 展開抑制: wrapInList 後の expand → setChecked 後の collapse →  checked=null 戻し
    // のループを防ぐ。また liftListItem 前に既存プレフィックスを明示的に畳む（Bug1/Bug3）。
    setBlockPrefixExpansionSuppressed(true);
    try {
        const depth = findListItemDepth(view.state, listItem);
        if (depth >= 0) {
            const li = view.state.selection.$from.node(depth);
            if (li.attrs.checked !== null) {
                // すでにチェックボックス → リストごと解除して「何もない」段落へ戻す。
                collapseCurrentExpandedBlock(view);
                liftListItem(listItem)(view.state, view.dispatch, view);
                view.focus();
                return;
            }
            // 通常のリスト項目（箇条書き等）→ チェックボックスにする。
            setChecked(view, depth, false);
            view.focus();
            return;
        }

        // リスト外（見出し含む）→ 段落へ落としてから箇条書きに包み、チェックボックスにする。
        // wrap と checked 設定は同じ transaction にまとめて 1 回だけ dispatch する
        // （2 回に分けると list-item-block Web Component の再マウントでカーソルが別
        // ブロックへ飛ぶことがある。詳細: docs/specifications/checkbox-cursor-jump-fix.md）。
        demoteHeadingToParagraph(view);
        wrapInBulletListAndSetChecked(view.state, view, false);
        view.focus();
    } finally {
        setBlockPrefixExpansionSuppressed(false);
    }
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

function bulletActive(state: EditorState): boolean {
    const bulletList = state.schema.nodes.bullet_list;
    const listItem = state.schema.nodes.list_item;
    if (!bulletList || !listItem) return false;
    const { $from } = state.selection;
    for (let depth = $from.depth; depth > 0; depth--) {
        if ($from.node(depth).type === bulletList) {
            // チェックボックス（タスク）項目は箇条書き扱いにしない。
            const itemDepth = findListItemDepth(state, listItem);
            return itemDepth < 0 || $from.node(itemDepth).attrs.checked === null;
        }
    }
    return false;
}

export function createPreviewToolbarPlugin(options: PreviewToolbarOptions) {
    const items: ToolbarItem[] = [
        { id: 'undo', label: '↶', title: t('Undo'), shortcutMac: '⌘Z', shortcutWin: 'Ctrl+Z', run: undo },
        { id: 'redo', label: '↷', title: t('Redo'), shortcutMac: '⌘⇧Z', shortcutWin: 'Ctrl+Shift+Z', run: redo, separatorAfter: true },
        { id: 'h1', label: 'H1', title: t('Heading 1'), shortcutMac: '⌥⌘1', shortcutWin: 'Alt+Ctrl+1', run: (v) => toggleHeading(v, 1), isActive: headingActive(1) },
        { id: 'h2', label: 'H2', title: t('Heading 2'), shortcutMac: '⌥⌘2', shortcutWin: 'Alt+Ctrl+2', run: (v) => toggleHeading(v, 2), isActive: headingActive(2) },
        { id: 'h3', label: 'H3', title: t('Heading 3'), shortcutMac: '⌥⌘3', shortcutWin: 'Alt+Ctrl+3', run: (v) => toggleHeading(v, 3), isActive: headingActive(3) },
        { id: 'checkbox', label: '☑', title: t('Checkbox'), shortcutMac: '⌥⌘4', shortcutWin: 'Alt+Ctrl+4', run: toggleCheckbox, isActive: checkboxActive },
        { id: 'bullet', label: '•', title: t('Bullet list'), shortcutMac: '⌥⌘5', shortcutWin: 'Alt+Ctrl+5', run: toggleBulletList, isActive: bulletActive },
        { id: 'numbered', label: '1.', title: t('Numbered list'), shortcutMac: '⌥⌘6', shortcutWin: 'Alt+Ctrl+6', run: toggleOrderedList, isActive: orderedActive },
        { id: 'quote', label: QUOTE_ICON_SVG, labelIsHtml: true, title: t('Quote'), shortcutMac: '⌥⌘9', shortcutWin: 'Alt+Ctrl+9', run: toggleQuote, isActive: blockquoteActive },
        { id: 'code', label: CODE_ICON_SVG, labelIsHtml: true, title: t('Code block'), shortcutMac: '⌥⌘8', shortcutWin: 'Alt+Ctrl+8', run: insertCodeBlock, isActive: codeBlockActive },
        { id: 'table', label: TABLE_ICON_SVG, labelIsHtml: true, title: t('Insert table'), run: insertTable }
    ];

    return $prose((ctx) => {
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

        // 左スクロール領域: 書式ボタン（Undo/Redo / 見出し / リスト / 引用 / コード / テーブル）
        const scrollSection = document.createElement('div');
        scrollSection.className = 'preview-toolbar-scroll';

        for (const item of items) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'preview-toolbar-btn';
            if (item.labelIsHtml) {
                btn.innerHTML = item.label;
            } else {
                btn.textContent = item.label;
            }
            btn.setAttribute('aria-label', item.title);
            wireHover(btn, item.title, shortcutOf(item));
            btn.addEventListener('click', () => {
                if (lastView) item.run(lastView, ctx);
            });
            scrollSection.appendChild(btn);
            buttonMap.set(item.id, btn);
            if (item.separatorAfter) {
                const sep = document.createElement('div');
                sep.className = 'preview-toolbar-sep';
                scrollSection.appendChild(sep);
            }
        }

        bar.appendChild(scrollSection);

        // 右固定領域: Zoom / Export / Raw-Preview トグル
        const fixedSection = document.createElement('div');
        fixedSection.className = 'preview-toolbar-fixed';

        // ズーム（拡大 / 縮小）: [−] [100%] [+]。% クリックで 100% に戻す。
        const zoomGroup = document.createElement('div');
        zoomGroup.className = 'preview-toolbar-zoom';

        const zoomLabel = document.createElement('button');
        zoomLabel.type = 'button';
        zoomLabel.className = 'preview-toolbar-zoom-label';
        const setZoomLabel = (percent: number): void => {
            zoomLabel.textContent = `${percent}%`;
        };
        setZoomLabel(options.initialZoom);

        const zoomOutBtn = document.createElement('button');
        zoomOutBtn.type = 'button';
        zoomOutBtn.className = 'preview-toolbar-btn';
        zoomOutBtn.textContent = '−';
        zoomOutBtn.setAttribute('aria-label', t('Zoom out'));
        wireHover(zoomOutBtn, t('Zoom out'), options.isMac ? '⌘−' : 'Ctrl+−');
        zoomOutBtn.addEventListener('click', () => setZoomLabel(options.onZoomOut()));

        const zoomInBtn = document.createElement('button');
        zoomInBtn.type = 'button';
        zoomInBtn.className = 'preview-toolbar-btn';
        zoomInBtn.textContent = '+';
        zoomInBtn.setAttribute('aria-label', t('Zoom in'));
        wireHover(zoomInBtn, t('Zoom in'), options.isMac ? '⌘+' : 'Ctrl++');
        zoomInBtn.addEventListener('click', () => setZoomLabel(options.onZoomIn()));

        zoomLabel.setAttribute('aria-label', t('Reset to 100%'));
        wireHover(zoomLabel, t('Reset to 100%'), '');
        zoomLabel.addEventListener('click', () => setZoomLabel(options.onZoomReset()));

        zoomGroup.appendChild(zoomOutBtn);
        zoomGroup.appendChild(zoomLabel);
        zoomGroup.appendChild(zoomInBtn);
        fixedSection.appendChild(zoomGroup);

        const exportBtn = document.createElement('button');
        exportBtn.type = 'button';
        exportBtn.className = 'preview-toolbar-btn preview-toolbar-export';
        exportBtn.textContent = 'Export';
        exportBtn.setAttribute('aria-label', t('Export to PDF / Marp (Pro)'));
        wireHover(exportBtn, t('Export to PDF / Marp (Pro)'), '');
        exportBtn.addEventListener('click', () => options.onExport());
        fixedSection.appendChild(exportBtn);

        // Preview / Raw 切り替え（Raw モードの CodeLens と対）。
        // いまは Preview なので Preview 側をアクティブ表示、Raw クリックで切り替え。
        const toggleGroup = document.createElement('div');
        toggleGroup.className = 'preview-toolbar-toggle';

        const previewSeg = document.createElement('button');
        previewSeg.type = 'button';
        previewSeg.className = 'preview-toolbar-seg active';
        previewSeg.textContent = 'Preview';
        previewSeg.setAttribute('aria-label', t('Currently in Preview mode'));
        previewSeg.addEventListener('mousedown', (e) => e.preventDefault());

        const rawSeg = document.createElement('button');
        rawSeg.type = 'button';
        rawSeg.className = 'preview-toolbar-seg';
        rawSeg.textContent = 'Raw';
        rawSeg.setAttribute('aria-label', t('Switch to Raw (Markdown source)'));
        const rawShortcut = options.isMac ? '⌘⇧.' : 'Ctrl+Shift+.';
        wireHover(rawSeg, t('Switch to Raw (Markdown source)'), rawShortcut);
        rawSeg.addEventListener('click', () => options.onToggleRaw());

        toggleGroup.appendChild(previewSeg);
        toggleGroup.appendChild(rawSeg);
        fixedSection.appendChild(toggleGroup);

        bar.appendChild(fixedSection);

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
