/**
 * WebView 側エントリポイント。esbuild で media/milkdown.bundle.js にバンドルされる。
 */
import { Editor, rootCtx, defaultValueCtx, editorViewCtx, editorViewOptionsCtx, commandsCtx } from '@milkdown/kit/core';
import { commonmark, remarkPreserveEmptyLinePlugin, insertImageCommand } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { history } from '@milkdown/kit/plugin/history';
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener';
import { replaceAll } from '@milkdown/kit/utils';
import { listItemBlockComponent, listItemBlockConfig } from '@milkdown/kit/component/list-item-block';
import hljs from 'highlight.js/lib/common';
import renderMathInElement from 'katex/contrib/auto-render';
import mermaid from 'mermaid';

import type { EditorView } from '@milkdown/prose/view';

import type { HostToWebviewMessage, PreviewSettings, ScrollAnchorPayload } from './types';
import { parseFrontmatterEntries } from '../../shared/markdown/frontmatter';
import { stripPlaceholderLineBreaks, tightenListSpacing, tightenParagraphSpacing } from '../../shared/markdown/lineBreaks';

/** Preview に出入りする Markdown の正規化（`<br />` 除去 + リスト/段落詰め）。 */
function normalizeMarkdown(markdown: string): string {
    return tightenParagraphSpacing(tightenListSpacing(stripPlaceholderLineBreaks(markdown)));
}
import {
    createScrollAnchor,
    headingMatchesScrollAnchor
} from '../../shared/structure/scrollAnchor';
import { focusSyntaxPlugin, setFocusSyntaxEnabled } from './focusSyntaxPlugin';
import { headingBackspacePlugin } from './headingBackspacePlugin';
import { createSlashMenuPlugin, PreviewSlashMenuController, setSlashMenuEnabled } from './previewSlashMenu';
import { createTableToolbarPlugin } from './tableToolbarPlugin';
import { createTableCellEnterPlugin } from './tableCellEnterPlugin';
import { createPreviewKeymapPlugin, handleSelectAll } from './previewKeymapPlugin';
import { createCodeLanguagePlugin } from './codeLanguagePlugin';
import { createPreviewDiffPlugin, setDiffBase } from './previewDiffPlugin';
import { PreviewFindBar } from './previewFindBar';

const vscodeApi = acquireVsCodeApi();
const root = document.getElementById('milkdown-root');
const frontmatterPanel = document.getElementById('frontmatter-panel');
const slashMenuEl = document.getElementById('slash-menu');

if (!root) {
    throw new Error('milkdown-root element not found');
}

const findBar = new PreviewFindBar(root);
document.addEventListener('keydown', (event) => {
    const mod = event.metaKey || event.ctrlKey;

    // Cmd/Ctrl+F: Preview 内検索
    if (mod && !event.altKey && !event.shiftKey && (event.code === 'KeyF' || event.key === 'f')) {
        event.preventDefault();
        event.stopPropagation();
        findBar.open();
        return;
    }

    // Cmd/Ctrl+A: テーブル/コードブロックの段階選択。
    // capture フェーズで横取りして、ProseMirror 標準の全選択より先に処理する
    // （プラグインの handleKeyDown は読み込み順により負けることがあるため）。
    if (mod && !event.altKey && !event.shiftKey && (event.code === 'KeyA' || event.key === 'a')) {
        if (!editor) return;
        const handled = editor.action((ctx) => {
            const view = ctx.get(editorViewCtx);
            if (!view.hasFocus()) return false;
            return handleSelectAll(view, ctx);
        });
        if (handled) {
            event.preventDefault();
            event.stopPropagation();
        }
    }
}, true);

const PROPORTIONAL_FONT_STACK =
    '-apple-system, BlinkMacSystemFont, "Segoe UI", "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", "Yu Gothic UI", Meiryo, "Noto Sans JP", sans-serif';

const CHECK_ICON_SVG = '<svg viewBox="0 0 16 16"><path d="M3 8.3L6.2 11.5L13 4.5" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function renderListItemLabel({ label, listType, checked }: { label: string; listType: string; checked?: boolean }): string {
    if (checked === undefined || checked === null) {
        return listType === 'bullet' ? '•' : label;
    }
    return checked ? CHECK_ICON_SVG : '';
}


let editor: Editor | null = null;
let lastSyncedMarkdown: string | null = null;
let currentFrontmatter: string | null = null;
let currentSettings: PreviewSettings | null = null;
let scrollReportEnabled = false;
const slashMenuController = slashMenuEl ? new PreviewSlashMenuController(slashMenuEl) : null;
const slashMenuPlugin = slashMenuController ? createSlashMenuPlugin(slashMenuController) : null;

function debounce<T extends (...args: never[]) => void>(fn: T, wait: number): (...args: Parameters<T>) => void {
    let timer: ReturnType<typeof setTimeout> | undefined;
    return (...args: Parameters<T>) => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => fn(...args), wait);
    };
}

function applySettingsToDom(settings: PreviewSettings): void {
    currentSettings = settings;
    document.body.classList.toggle('theme-light', settings.theme === 'light');
    document.body.classList.toggle('theme-dark', settings.theme === 'dark');
    // 既定は等幅エディタフォントではなく、CJK を含む比例フォント。等幅だと
    // ASCII と日本語でフォールバックが分かれ、太さ（＝色）が不揃いに見えるため。
    document.documentElement.style.setProperty(
        '--preview-font-family',
        settings.fontFamily || PROPORTIONAL_FONT_STACK
    );
    document.documentElement.style.setProperty('--preview-font-size', `${settings.fontSize}px`);
    document.documentElement.style.setProperty(
        '--preview-max-width',
        settings.maxWidth > 0 ? `${settings.maxWidth}px` : 'none'
    );
    scrollReportEnabled = !!settings.syncScroll;

    if (frontmatterPanel) {
        frontmatterPanel.hidden = !settings.showFrontmatter;
    }

    setFocusSyntaxEnabled(settings.showFocusSyntax);
    setSlashMenuEnabled(settings.enableSlashMenu);
    if (!settings.enableSlashMenu) {
        slashMenuController?.hide();
    }

    mermaid.initialize({
        startOnLoad: false,
        theme: settings.theme === 'dark' ? 'dark' : 'default',
        securityLevel: 'strict'
    });
}

function renderFrontmatterPanel(yaml: string | null | undefined): void {
    if (!frontmatterPanel) return;
    if (!yaml || !currentSettings?.showFrontmatter) {
        frontmatterPanel.innerHTML = '';
        frontmatterPanel.hidden = true;
        return;
    }

    frontmatterPanel.hidden = false;
    const rows = parseFrontmatterEntries(yaml)
        .map(({ key, value }) => `<div class="fm-row"><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd></div>`)
        .join('');
    frontmatterPanel.innerHTML = `<dl class="fm-list">${rows}</dl>`;
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function highlightCodeBlocks(): void {
    // カーソルがあるコードブロックは hljs で DOM を書き換えない（ProseMirror が
    // 管理する編集中の要素を書き換えるとカーソルが先頭へ飛ぶため）。それ以外の
    // ブロックは色付けする。フォーカスが外れたら再ハイライトできるようにする。
    const selection = document.getSelection();
    const anchor = selection?.anchorNode ?? null;
    const focusedPre = anchor
        ? ((anchor instanceof Element ? anchor : anchor.parentElement)?.closest('pre') ?? null)
        : null;

    root.querySelectorAll('pre code').forEach(block => {
        const el = block as HTMLElement;
        const pre = el.parentElement;
        if (el.classList.contains('language-mermaid')) return;
        if (pre && pre === focusedPre) {
            // 編集中のブロックは素のまま。外れたら再着色できるようマークを外す。
            delete pre.dataset.highlighted;
            return;
        }
        if (pre?.dataset.highlighted === 'yes') return;
        hljs.highlightElement(el);
        if (pre) pre.dataset.highlighted = 'yes';
    });
}

async function renderMermaidBlocks(): Promise<void> {
    if (!currentSettings?.enableMermaid) return;
    const blocks = root.querySelectorAll('pre code.language-mermaid');
    for (const block of blocks) {
        const pre = block.parentElement;
        if (!pre || pre.dataset.mermaidRendered === 'yes') continue;
        const code = block.textContent?.trim() ?? '';
        if (!code) continue;
        try {
            const id = `mermaid-${Math.random().toString(36).slice(2, 9)}`;
            const { svg } = await mermaid.render(id, code);
            const container = document.createElement('div');
            container.className = 'mermaid-diagram';
            container.innerHTML = svg;
            pre.replaceWith(container);
            container.dataset.mermaidRendered = 'yes';
        } catch {
            pre.dataset.mermaidRendered = 'error';
        }
    }
}

function renderMath(): void {
    if (!currentSettings?.enableMath) return;
    renderMathInElement(root, {
        delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '$', right: '$', display: false }
        ],
        throwOnError: false
    });
}

async function enhanceRenderedContent(): Promise<void> {
    highlightCodeBlocks();
    renderMath();
    await renderMermaidBlocks();
}

function handlePreviewLinkClick(event: Event): boolean {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return false;
    const anchor = target.closest('a');
    if (!anchor) return false;

    const href = anchor.getAttribute('href');
    if (!href) return false;

    event.preventDefault();
    event.stopPropagation();
    vscodeApi.postMessage({ type: 'openLink', href });
    return true;
}

function sendImageFile(file: File): void {
    const reader = new FileReader();
    reader.onload = () => {
        if (typeof reader.result === 'string') {
            vscodeApi.postMessage({ type: 'insertImage', dataUrl: reader.result, name: file.name || 'image' });
        }
    };
    reader.readAsDataURL(file);
}

/** ペースト/ドロップに画像があればホストへ送って保存し、true（処理済み）を返す。 */
function handleImageDataTransfer(data: DataTransfer | null): boolean {
    if (!data) return false;
    const items = Array.from(data.items ?? []);
    const imageItem = items.find((item) => item.kind === 'file' && item.type.startsWith('image/'));
    if (imageItem) {
        const file = imageItem.getAsFile();
        if (file) {
            sendImageFile(file);
            return true;
        }
    }
    const file = Array.from(data.files ?? []).find((f) => f.type.startsWith('image/'));
    if (file) {
        sendImageFile(file);
        return true;
    }
    return false;
}

function insertImageSrc(src: string): void {
    if (!editor) return;
    editor.action((ctx) => {
        ctx.get(commandsCtx).call(insertImageCommand.key, { src });
    });
}

// 差分基準（Git HEAD 本文）。エディタ作成前に届くこともあるので保留しておく。
let pendingDiffBase: string | null | undefined;

function applyDiffBase(baseMarkdown: string | null): void {
    if (!editor) {
        pendingDiffBase = baseMarkdown;
        return;
    }
    editor.action((ctx) => setDiffBase(ctx, baseMarkdown));
}

/** 選択テキストがある状態で URL を貼ると、その選択をリンクにする（テキストは保持）。 */
function handleUrlPaste(view: EditorView, data: DataTransfer | null): boolean {
    if (!data) return false;
    const text = data.getData('text/plain').trim();
    if (!/^https?:\/\/\S+$/i.test(text) || /\s/.test(text)) return false;

    const { state } = view;
    const { from, to, empty } = state.selection;
    if (empty) return false;

    const linkType = state.schema.marks.link;
    if (!linkType) return false;

    view.dispatch(state.tr.addMark(from, to, linkType.create({ href: text })));
    return true;
}

function setEditable(editable: boolean): void {
    if (!editor) return;
    editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        view.setProps({ editable: () => editable });
    });
}

function postChange(markdown: string): void {
    const next = tightenParagraphSpacing(tightenListSpacing(markdown));
    if (next === lastSyncedMarkdown) return;
    lastSyncedMarkdown = next;
    vscodeApi.postMessage({ type: 'change', markdown: next });
    void enhanceRenderedContent();
}

// 空段落・空セルを `<br />` として保存する remark-preserve-empty-line を除外し、
// 通常の空行で保存されるようにする（commonmark は [plugin, options] を含む配列）。
const commonmarkWithoutEmptyLineBreaks = commonmark.filter(
    (plugin) =>
        plugin !== remarkPreserveEmptyLinePlugin.plugin &&
        plugin !== remarkPreserveEmptyLinePlugin.options
);

async function createEditor(markdown: string, settings: PreviewSettings): Promise<void> {
    const initialMarkdown = normalizeMarkdown(markdown);
    lastSyncedMarkdown = initialMarkdown;
    setFocusSyntaxEnabled(settings.showFocusSyntax);
    setSlashMenuEnabled(settings.enableSlashMenu);

    const builder = Editor.make()
        .config((ctx) => {
            ctx.set(rootCtx, root);
            ctx.set(defaultValueCtx, initialMarkdown);
            ctx.update(editorViewOptionsCtx, (prev) => ({
                ...prev,
                editable: () => settings.editable,
                handleDOMEvents: {
                    click: (_view, event) => handlePreviewLinkClick(event),
                    paste: (view, event) => {
                        if (handleImageDataTransfer(event.clipboardData)) {
                            event.preventDefault();
                            return true;
                        }
                        if (handleUrlPaste(view, event.clipboardData)) {
                            event.preventDefault();
                            return true;
                        }
                        return false;
                    },
                    drop: (_view, event) => {
                        if (handleImageDataTransfer(event.dataTransfer)) {
                            event.preventDefault();
                            return true;
                        }
                        return false;
                    }
                }
            }));
            ctx.get(listenerCtx).markdownUpdated((_ctx, nextMarkdown) => {
                postChange(nextMarkdown);
            });
            ctx.set(listItemBlockConfig.key, { renderLabel: renderListItemLabel });
        })
        // Keymap overrides must come before the presets so their handleKeyDown
        // runs ahead of the base/gfm keymaps (Cmd+A, Cmd+Opt+N, Enter-in-cell).
        .use(createPreviewKeymapPlugin())
        .use(createTableCellEnterPlugin())
        .use(commonmarkWithoutEmptyLineBreaks)
        .use(gfm)
        .use(history)
        .use(listener)
        .use(listItemBlockComponent)
        .use(createTableToolbarPlugin())
        .use(createCodeLanguagePlugin())
        .use(createPreviewDiffPlugin())
        .use(focusSyntaxPlugin)
        .use(headingBackspacePlugin);

    if (slashMenuPlugin) {
        builder.use(slashMenuPlugin);
    }

    editor = await builder.create();
    slashMenuController?.bindEditor(editor);

    if (pendingDiffBase !== undefined) {
        applyDiffBase(pendingDiffBase);
        pendingDiffBase = undefined;
    }

    await enhanceRenderedContent();
}

function applyExternalMarkdown(markdown: string): void {
    const next = normalizeMarkdown(markdown);
    if (!editor || next === lastSyncedMarkdown) return;
    lastSyncedMarkdown = next;
    editor.action(replaceAll(next));
    void enhanceRenderedContent();
}

function scrollToAnchor(anchor: ScrollAnchorPayload): void {
    const headings = root.querySelectorAll('h1,h2,h3,h4,h5,h6');
    for (const heading of headings) {
        const text = heading.textContent?.trim() ?? '';
        if (headingMatchesScrollAnchor(text, anchor)) {
            heading.scrollIntoView({ block: 'start', behavior: 'auto' });
            return;
        }
    }
}

function findVisibleAnchor(): ScrollAnchorPayload | undefined {
    const headings = Array.from(root.querySelectorAll('h1,h2,h3,h4,h5,h6'));
    if (headings.length === 0) return undefined;

    const rootTop = root.getBoundingClientRect().top;
    let candidate: Element | undefined;
    for (const heading of headings) {
        if (heading.getBoundingClientRect().top <= rootTop + 8) candidate = heading;
        else break;
    }
    const target = candidate ?? headings[0];
    const title = target.textContent?.trim() ?? '';
    if (!title) return undefined;
    return createScrollAnchor(title);
}

function isHostMessage(data: unknown): data is HostToWebviewMessage {
    return typeof data === 'object' && data !== null && 'type' in data;
}

const reportScroll = debounce(() => {
    if (!scrollReportEnabled) return;
    const denom = Math.max(1, root.scrollHeight - root.clientHeight);
    const ratio = root.scrollTop / denom;
    const anchor = findVisibleAnchor();
    vscodeApi.postMessage({ type: 'scroll', ratio, anchor });
}, 150);
root.addEventListener('scroll', reportScroll);

// カーソルがコードブロックから外れたときに、そのブロックを再着色する。
// 既に着色済みのブロックはスキップされるため負荷は小さい。
const rehighlightOnSelection = debounce(() => highlightCodeBlocks(), 120);
document.addEventListener('selectionchange', rehighlightOnSelection);

function applyFadeIn(enabled: boolean): void {
    if (!enabled) return;
    document.body.classList.remove('preview-fade-in');
    void document.body.offsetWidth;
    document.body.classList.add('preview-fade-in');
}

window.addEventListener('message', (event: MessageEvent) => {
    const message = event.data;
    if (!isHostMessage(message)) return;

    if (message.type === 'init') {
        applySettingsToDom(message.settings);
        currentFrontmatter = message.frontmatter ?? null;
        renderFrontmatterPanel(currentFrontmatter);
        void createEditor(message.markdown, message.settings).then(() => {
            const { settings, scrollAnchor, scrollRatio } = message;
            if (settings.syncScroll && scrollAnchor) {
                requestAnimationFrame(() => scrollToAnchor(scrollAnchor));
            } else if (settings.syncScroll && typeof scrollRatio === 'number') {
                requestAnimationFrame(() => {
                    root.scrollTop = scrollRatio * Math.max(0, root.scrollHeight - root.clientHeight);
                });
            }
            applyFadeIn(settings.enableTransitions);
        });
        return;
    }
    if (message.type === 'update') {
        if (message.frontmatter !== undefined) {
            currentFrontmatter = message.frontmatter;
            renderFrontmatterPanel(currentFrontmatter);
        }
        applyExternalMarkdown(message.markdown);
        return;
    }
    if (message.type === 'settings') {
        applySettingsToDom(message.settings);
        setEditable(message.settings.editable);
        renderFrontmatterPanel(currentFrontmatter);
        return;
    }
    if (message.type === 'imageInserted') {
        insertImageSrc(message.src);
        return;
    }
    if (message.type === 'baseMarkdown') {
        applyDiffBase(message.baseMarkdown);
    }
});

vscodeApi.postMessage({ type: 'ready' });
