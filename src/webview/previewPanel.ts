/**
 * WebView Markdown プレビュー機能（Phase 1: 読み取り専用）
 *
 * docs/specifications/preview-raw-toggle.md の Phase 1 (MVP) を実装する。
 * Preview 上での直接編集（WYSIWYG / Milkdown）は対象外。
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { marked, Renderer } from 'marked';

type DebugLogFunction = (message: string, ...args: unknown[]) => void;

let debugLog: DebugLogFunction = () => {};

export function setDebugLog(logFn: DebugLogFunction): void {
    debugLog = logFn;
}

const openPanels = new Map<string, vscode.WebviewPanel>();
// 手動で Raw に戻した URI（セッション中は defaultMode による自動再オープンを抑止）
const manuallyRawSessionUris = new Set<string>();

// dompurify の CJS ビルドは require 時点で即時実行され、グローバル window が無いと
// 例外になる。jsdom の window を一度だけグローバルに設定してから遅延 require する。
let sanitizeHtml: ((dirty: string) => string) | null = null;

function getSanitizer(): (dirty: string) => string {
    if (sanitizeHtml) {
        return sanitizeHtml;
    }

    const { JSDOM } = require('jsdom');
    const dom = new JSDOM('<!DOCTYPE html>');
    const globalWithDom = global as unknown as { window?: unknown; document?: unknown };
    globalWithDom.window = dom.window;
    globalWithDom.document = dom.window.document;

    // require('dompurify') はこの時点のグローバル window に束縛された
    // インスタンスをそのまま export している（factory ではない）。
    const purify = require('dompurify');
    sanitizeHtml = (dirty: string): string => purify.sanitize(dirty) as string;
    return sanitizeHtml;
}

function getPreviewDefaultMode(): string {
    return vscode.workspace.getConfiguration('markdownInline').get<string>('preview.defaultMode', 'raw');
}

function escapeAttribute(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function resolveImageSrc(href: string, documentDir: string, panel: vscode.WebviewPanel): string {
    if (/^[a-z][a-z0-9+.-]*:/i.test(href)) {
        // http(s):, data:, vscode-resource: 等のスキーム付きはそのまま使う
        return href;
    }
    const absolutePath = path.resolve(documentDir, href);
    return panel.webview.asWebviewUri(vscode.Uri.file(absolutePath)).toString();
}

function renderMarkdownToHtml(document: vscode.TextDocument, panel: vscode.WebviewPanel): string {
    const documentDir = path.dirname(document.uri.fsPath);

    const renderer = new Renderer();
    renderer.image = (href: string, title: string | null, text: string): string => {
        const src = resolveImageSrc(href, documentDir, panel);
        const titleAttr = title ? ` title="${escapeAttribute(title)}"` : '';
        return `<img src="${escapeAttribute(src)}" alt="${escapeAttribute(text)}"${titleAttr}>`;
    };

    const rawHtml = marked(document.getText(), { renderer });
    const safeHtml = getSanitizer()(rawHtml);
    return wrapInHtmlDocument(safeHtml, document);
}

function wrapInHtmlDocument(bodyHtml: string, document: vscode.TextDocument): string {
    const title = path.basename(document.uri.fsPath);
    return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<title>${escapeAttribute(title)}</title>
<style>
  body {
    background: var(--vscode-editor-background);
    color: var(--vscode-editor-foreground);
    font-family: var(--vscode-editor-font-family, -apple-system, sans-serif);
    font-size: var(--vscode-editor-font-size, 14px);
    line-height: 1.6;
    max-width: 800px;
    margin: 0 auto;
    padding: 24px 32px 64px;
  }
  a { color: var(--vscode-textLink-foreground); }
  code, pre {
    background: var(--vscode-textCodeBlock-background);
    color: var(--vscode-textPreformat-foreground, inherit);
  }
  pre { padding: 12px; overflow-x: auto; border-radius: 4px; }
  pre code { background: transparent; }
  blockquote {
    border-left: 4px solid var(--vscode-editorGroup-border);
    margin-left: 0;
    padding-left: 12px;
    opacity: 0.85;
  }
  hr { border: none; border-top: 1px solid var(--vscode-editorGroup-border); }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid var(--vscode-editorGroup-border); padding: 6px 10px; }
  img { max-width: 100%; }
  h1, h2, h3, h4, h5, h6 { border-bottom: 1px solid var(--vscode-editorGroup-border); padding-bottom: 0.3em; }
</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

function togglePreview(
    context: vscode.ExtensionContext,
    document: vscode.TextDocument,
    viewColumn: vscode.ViewColumn | undefined
): void {
    const key = document.uri.toString();
    const existing = openPanels.get(key);
    if (existing) {
        existing.dispose();
        manuallyRawSessionUris.add(key);
        void vscode.window.showTextDocument(document, viewColumn);
        return;
    }

    manuallyRawSessionUris.delete(key);

    const documentDir = path.dirname(document.uri.fsPath);
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    const localResourceRoots = [vscode.Uri.file(documentDir)];
    if (workspaceFolder) {
        localResourceRoots.push(workspaceFolder.uri);
    }

    const panel = vscode.window.createWebviewPanel(
        'ipreviewPreview',
        `Preview: ${path.basename(document.uri.fsPath)}`,
        viewColumn ?? vscode.ViewColumn.Active,
        {
            enableScripts: false,
            retainContextWhenHidden: true,
            localResourceRoots
        }
    );

    openPanels.set(key, panel);
    panel.webview.html = renderMarkdownToHtml(document, panel);

    panel.onDidDispose(() => {
        openPanels.delete(key);
    }, null, context.subscriptions);

    debugLog(`[preview] Opened WebView preview for ${key}`);
}

export function activatePreviewFeature(context: vscode.ExtensionContext): {
    refreshIfOpen: (document: vscode.TextDocument) => void;
} {
    context.subscriptions.push(
        vscode.commands.registerCommand('markdownInline.togglePreview', () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.document.languageId !== 'markdown') {
                return;
            }
            togglePreview(context, editor.document, editor.viewColumn);
        })
    );

    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument(document => {
            if (document.languageId !== 'markdown') {
                return;
            }
            const key = document.uri.toString();
            if (manuallyRawSessionUris.has(key) || openPanels.has(key)) {
                return;
            }
            if (getPreviewDefaultMode() !== 'preview') {
                return;
            }
            const editor = vscode.window.activeTextEditor;
            const viewColumn = editor && editor.document === document ? editor.viewColumn : undefined;
            togglePreview(context, document, viewColumn);
        })
    );

    return {
        refreshIfOpen(document: vscode.TextDocument): void {
            const panel = openPanels.get(document.uri.toString());
            if (panel) {
                panel.webview.html = renderMarkdownToHtml(document, panel);
            }
        }
    };
}
