/**
 * WebView 側エントリポイント。esbuild で media/milkdown.bundle.js にバンドルされる。
 */
import { Editor, rootCtx, defaultValueCtx, editorViewCtx, editorViewOptionsCtx } from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { history } from '@milkdown/kit/plugin/history';
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener';
import { replaceAll } from '@milkdown/kit/utils';
import { listItemBlockComponent } from '@milkdown/kit/component/list-item-block';
import hljs from 'highlight.js/lib/common';
import renderMathInElement from 'katex/contrib/auto-render';
import mermaid from 'mermaid';

import type { HostToWebviewMessage, PreviewSettings, ScrollAnchorPayload } from './types';
import { parseFrontmatterEntries } from '../../shared/markdown/frontmatter';
import {
    createScrollAnchor,
    headingMatchesScrollAnchor
} from '../../shared/structure/scrollAnchor';
import { focusSyntaxPlugin, setFocusSyntaxEnabled } from './focusSyntaxPlugin';
import { createSlashMenuPlugin, PreviewSlashMenuController, setSlashMenuEnabled } from './previewSlashMenu';

const vscodeApi = acquireVsCodeApi();
const root = document.getElementById('milkdown-root');
const frontmatterPanel = document.getElementById('frontmatter-panel');
const slashMenuEl = document.getElementById('slash-menu');

if (!root) {
    throw new Error('milkdown-root element not found');
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
    document.documentElement.style.setProperty(
        '--preview-font-family',
        settings.fontFamily || 'var(--vscode-editor-font-family)'
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
    root.querySelectorAll('pre code').forEach(block => {
        const el = block as HTMLElement;
        if (el.classList.contains('language-mermaid')) return;
        if (el.parentElement?.dataset.highlighted === 'yes') return;
        hljs.highlightElement(el);
        if (el.parentElement) el.parentElement.dataset.highlighted = 'yes';
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

function setEditable(editable: boolean): void {
    if (!editor) return;
    editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        view.setProps({ editable: () => editable });
    });
}

function postChange(markdown: string): void {
    if (markdown === lastSyncedMarkdown) return;
    lastSyncedMarkdown = markdown;
    vscodeApi.postMessage({ type: 'change', markdown });
    void enhanceRenderedContent();
}

async function createEditor(markdown: string, settings: PreviewSettings): Promise<void> {
    lastSyncedMarkdown = markdown;
    setFocusSyntaxEnabled(settings.showFocusSyntax);
    setSlashMenuEnabled(settings.enableSlashMenu);

    const builder = Editor.make()
        .config((ctx) => {
            ctx.set(rootCtx, root);
            ctx.set(defaultValueCtx, markdown);
            ctx.update(editorViewOptionsCtx, (prev) => ({
                ...prev,
                editable: () => settings.editable,
                handleDOMEvents: {
                    click: (_view, event) => handlePreviewLinkClick(event)
                }
            }));
            ctx.get(listenerCtx).markdownUpdated((_ctx, nextMarkdown) => {
                postChange(nextMarkdown);
            });
        })
        .use(commonmark)
        .use(gfm)
        .use(history)
        .use(listener)
        .use(listItemBlockComponent)
        .use(focusSyntaxPlugin);

    if (slashMenuPlugin) {
        builder.use(slashMenuPlugin);
    }

    editor = await builder.create();
    slashMenuController?.bindEditor(editor);

    await enhanceRenderedContent();
}

function applyExternalMarkdown(markdown: string): void {
    if (!editor || markdown === lastSyncedMarkdown) return;
    lastSyncedMarkdown = markdown;
    editor.action(replaceAll(markdown));
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
    }
});

vscodeApi.postMessage({ type: 'ready' });
