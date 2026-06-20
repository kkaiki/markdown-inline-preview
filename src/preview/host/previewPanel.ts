/**
 * Preview / Raw トグル機能（docs/specifications/preview-raw-toggle.md の Phase 1 + 2）
 *
 * CustomTextEditorProvider として実装することで、別タブを開かずに同一タブの中で
 * 通常のテキストエディタと Milkdown WYSIWYG エディタを切り替える(`vscode.openWith`)。
 * CustomTextEditorProvider は TextDocument を直接バックエンドにするため、
 * Undo/Redo・保存・dirty 状態は VSCode 標準のテキストエディタと同じ仕組みで動く。
 *
 * WebView 内では Milkdown による WYSIWYG 編集を行い、変更は debounce 200ms で
 * TextDocument へ反映・自動保存する。Raw 側の変更も debounce 100ms で WebView に反映する。
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as crypto from 'crypto';

import type { PreviewSettings, ScrollAnchorPayload } from '../webview/types';
import { prepareMarkdownImagesForWebview, restoreMarkdownImagesFromWebview } from './markdownTransform';
import { splitFrontmatter, mergeFrontmatter } from '../../shared/markdown/frontmatter';
import { findScrollAnchor, findLineBySlug } from '../../shared/structure/scrollAnchor';

type DebugLogFunction = (message: string, ...args: unknown[]) => void;

let debugLog: DebugLogFunction = () => {};

export function setDebugLog(logFn: DebugLogFunction): void {
    debugLog = logFn;
}

const VIEW_TYPE = 'ipreview.preview';
const GLOBAL_MODE_KEY = 'markdownInline.previewMode';
const PREVIEW_ACTIVE_CONTEXT = 'ipreview.previewActive';
const MARKDOWN_EDITOR_CONTEXT = 'ipreview.markdownEditor';

// Preview を開く直前のスクロール状態（resolveCustomTextEditor の init で消費）
const pendingOpenScrollRatio = new Map<string, number>();
const pendingOpenScrollAnchor = new Map<string, ScrollAnchorPayload>();
const lastKnownScrollRatio = new Map<string, number>();
const lastKnownScrollAnchor = new Map<string, ScrollAnchorPayload>();

function getConfig<T>(key: string, fallback: T): T {
    return vscode.workspace.getConfiguration('markdownInline').get<T>(key, fallback);
}

function getNonce(): string {
    return crypto.randomBytes(16).toString('base64');
}

function mimeToExt(mime: string): string | undefined {
    return {
        'image/png': '.png',
        'image/jpeg': '.jpg',
        'image/gif': '.gif',
        'image/webp': '.webp',
        'image/svg+xml': '.svg',
        'image/bmp': '.bmp',
        'image/avif': '.avif'
    }[mime];
}

function resolveThemeKind(): 'light' | 'dark' {
    const setting = getConfig<string>('preview.theme', 'auto');
    if (setting === 'light' || setting === 'dark') return setting;
    const kind = vscode.window.activeColorTheme.kind;
    return kind === vscode.ColorThemeKind.Light || kind === vscode.ColorThemeKind.HighContrastLight
        ? 'light'
        : 'dark';
}

function buildSettingsPayload(): PreviewSettings {
    return {
        theme: resolveThemeKind(),
        fontFamily: getConfig<string>('preview.fontFamily', ''),
        fontSize: getConfig<number>('preview.fontSize', 12),
        maxWidth: getConfig<number>('preview.maxWidth', 800),
        editable: getConfig<boolean>('preview.editable', true),
        syncScroll: getConfig<boolean>('preview.syncScroll', true),
        enableMath: getConfig<boolean>('preview.enableMath', true),
        enableMermaid: getConfig<boolean>('preview.enableMermaid', true),
        showFrontmatter: getConfig<boolean>('preview.showFrontmatter', true),
        enableTransitions: getConfig<boolean>('preview.enableTransitions', true),
        showFocusSyntax: getConfig<boolean>('preview.showFocusSyntax', true),
        enableSlashMenu: getConfig<boolean>('preview.enableSlashMenu', true)
    };
}

function buildHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
    const nonce = getNonce();
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'milkdown.bundle.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'milkdown-preview.css'));
    const hljsStyleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'hljs-github.css'));
    const katexStyleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'katex.min.css'));
    const csp = [
        "default-src 'none'",
        `style-src ${webview.cspSource} 'unsafe-inline'`,
        `font-src ${webview.cspSource}`,
        `img-src ${webview.cspSource} https: data:`,
        `script-src 'nonce-${nonce}'`
    ].join('; ');

    return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${styleUri.toString()}">
<link rel="stylesheet" href="${hljsStyleUri.toString()}">
<link rel="stylesheet" href="${katexStyleUri.toString()}">
</head>
<body>
<div id="frontmatter-panel" class="frontmatter-panel" role="region" aria-label="Document frontmatter" hidden></div>
<div id="slash-menu" class="slash-menu" role="listbox" aria-label="Slash commands" hidden></div>
<div id="milkdown-root" role="document" aria-label="Markdown preview editor"></div>
<script nonce="${nonce}" src="${scriptUri.toString()}"></script>
</body>
</html>`;
}

// Raw / Preview のモードは「最後に使ったモード」を全 Markdown ファイル横断で
// 共有する（globalState）。あるファイルを Preview に切り替えると、以降に開く
// すべての Markdown ファイルが Preview で開くようになる。
function rememberMode(context: vscode.ExtensionContext, mode: 'raw' | 'preview'): void {
    if (!getConfig<boolean>('preview.rememberMode', true)) return;
    void context.globalState.update(GLOBAL_MODE_KEY, mode);
}

function getRememberedMode(context: vscode.ExtensionContext): 'raw' | 'preview' | undefined {
    if (!getConfig<boolean>('preview.rememberMode', true)) return undefined;
    return context.globalState.get<'raw' | 'preview'>(GLOBAL_MODE_KEY);
}

function computeScrollRatio(editor: vscode.TextEditor | undefined): number | undefined {
    if (!editor || editor.document.lineCount <= 1) return undefined;
    const topLine = editor.visibleRanges[0]?.start.line ?? 0;
    return topLine / editor.document.lineCount;
}

function revealRatio(editor: vscode.TextEditor, ratio: number): void {
    const document = editor.document;
    const targetLine = Math.min(
        document.lineCount - 1,
        Math.max(0, Math.round(ratio * document.lineCount))
    );
    const range = new vscode.Range(targetLine, 0, targetLine, 0);
    editor.revealRange(range, vscode.TextEditorRevealType.AtTop);
}

function revealAnchor(editor: vscode.TextEditor, anchor: ScrollAnchorPayload): void {
    const line = findLineBySlug(editor.document, anchor.slug) ?? anchor.line;
    const range = new vscode.Range(line, 0, line, 0);
    editor.revealRange(range, vscode.TextEditorRevealType.AtTop);
}

class PreviewEditorProvider implements vscode.CustomTextEditorProvider {
    private readonly imageUriMaps = new Map<string, Map<string, string>>();
    private readonly frontmatterMaps = new Map<string, string | null>();

    constructor(private readonly context: vscode.ExtensionContext) {}

    private prepareForWebview(
        markdown: string,
        document: vscode.TextDocument,
        webview: vscode.Webview
    ): { body: string; frontmatter: string | null } {
        const { frontmatter, body } = splitFrontmatter(markdown);
        const { markdown: rewritten, uriMap } = prepareMarkdownImagesForWebview(
            body,
            document.uri.fsPath,
            {
                asWebviewUri: (filePath: string) => webview.asWebviewUri(vscode.Uri.file(filePath)).toString()
            }
        );
        const key = document.uri.toString();
        this.imageUriMaps.set(key, uriMap);
        this.frontmatterMaps.set(key, frontmatter);
        return { body: rewritten, frontmatter };
    }

    private restoreFromWebview(markdown: string, document: vscode.TextDocument): string {
        const key = document.uri.toString();
        const uriMap = this.imageUriMaps.get(key);
        const restoredBody = uriMap ? restoreMarkdownImagesFromWebview(markdown, uriMap) : markdown;
        const frontmatter = this.frontmatterMaps.get(key) ?? null;
        return mergeFrontmatter(frontmatter, restoredBody);
    }

    /**
     * Preview に貼り付け/ドロップされた画像をドキュメント隣の `assets/` に保存し、
     * WebView URI を返す。保存時に WebView URI → 相対パスの対応を登録しておくことで、
     * 挿入結果は `![](assets/...)` として `.md` に保存される。
     */
    private async savePastedImage(
        dataUrl: string,
        name: string,
        document: vscode.TextDocument,
        documentDir: string,
        webview: vscode.Webview
    ): Promise<void> {
        const match = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl);
        if (!match) return;
        const mime = match[1];
        const bytes = Buffer.from(match[2], 'base64');
        if (bytes.length === 0) return;

        const extFromName = path.extname(name);
        const ext = mimeToExt(mime) ?? (extFromName !== '' ? extFromName : '.png');
        const base = path.basename(name, path.extname(name)).replace(/[^\w.-]+/g, '-').slice(0, 40) || 'image';
        const fileName = `${base}-${Date.now()}${ext}`;
        const assetsDir = path.join(documentDir, 'assets');
        const filePath = path.join(assetsDir, fileName);

        try {
            await vscode.workspace.fs.createDirectory(vscode.Uri.file(assetsDir));
            await vscode.workspace.fs.writeFile(vscode.Uri.file(filePath), bytes);
        } catch (error) {
            debugLog(`[preview] Failed to save pasted image: ${String(error)}`);
            void vscode.window.showWarningMessage('画像の保存に失敗しました。');
            return;
        }

        const relPath = `assets/${fileName}`;
        const webviewUri = webview.asWebviewUri(vscode.Uri.file(filePath)).toString();
        const key = document.uri.toString();
        let uriMap = this.imageUriMaps.get(key);
        if (!uriMap) {
            uriMap = new Map<string, string>();
            this.imageUriMaps.set(key, uriMap);
        }
        uriMap.set(webviewUri, relPath);

        void webview.postMessage({ type: 'imageInserted', src: webviewUri });
    }

    public resolveCustomTextEditor(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken
    ): void {
        const key = document.uri.toString();
        const documentDir = path.dirname(document.uri.fsPath);
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
        const localResourceRoots = [
            vscode.Uri.joinPath(this.context.extensionUri, 'media'),
            vscode.Uri.file(documentDir)
        ];
        if (workspaceFolder) localResourceRoots.push(workspaceFolder.uri);

        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots
        };
        webviewPanel.webview.html = buildHtml(webviewPanel.webview, this.context.extensionUri);

        let applyingRemoteEdit = false;
        let pushTimer: ReturnType<typeof setTimeout> | undefined;

        const schedulePush = (): void => {
            if (pushTimer) clearTimeout(pushTimer);
            pushTimer = setTimeout(() => {
                pushTimer = undefined;
                const prepared = this.prepareForWebview(
                    document.getText(),
                    document,
                    webviewPanel.webview
                );
                void webviewPanel.webview.postMessage({
                    type: 'update',
                    markdown: prepared.body,
                    frontmatter: prepared.frontmatter
                });
            }, 100);
        };

        const applyMarkdownFromWebview = async (markdown: string): Promise<void> => {
            const restored = this.restoreFromWebview(markdown, document);
            if (document.getText() === restored) return;
            applyingRemoteEdit = true;
            try {
                const fullRange = new vscode.Range(
                    document.positionAt(0),
                    document.positionAt(document.getText().length)
                );
                const edit = new vscode.WorkspaceEdit();
                edit.replace(document.uri, fullRange, restored);
                await vscode.workspace.applyEdit(edit);
                await document.save();
            } finally {
                applyingRemoteEdit = false;
            }
        };

        const changeSub = vscode.workspace.onDidChangeTextDocument(event => {
            if (event.document.uri.toString() !== key || applyingRemoteEdit) return;
            schedulePush();
        });

        const themeSub = vscode.window.onDidChangeActiveColorTheme(() => {
            void webviewPanel.webview.postMessage({ type: 'settings', settings: buildSettingsPayload() });
        });

        const configSub = vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration('markdownInline.preview')) {
                void webviewPanel.webview.postMessage({ type: 'settings', settings: buildSettingsPayload() });
            }
        });

        const messageSub = webviewPanel.webview.onDidReceiveMessage(message => {
            if (!message || typeof message !== 'object') return;

            if (message.type === 'ready') {
                const scrollAnchor = pendingOpenScrollAnchor.get(key);
                pendingOpenScrollAnchor.delete(key);
                const scrollRatio = pendingOpenScrollRatio.get(key);
                pendingOpenScrollRatio.delete(key);
                const prepared = this.prepareForWebview(document.getText(), document, webviewPanel.webview);
                void webviewPanel.webview.postMessage({
                    type: 'init',
                    markdown: prepared.body,
                    frontmatter: prepared.frontmatter,
                    settings: buildSettingsPayload(),
                    scrollAnchor,
                    scrollRatio
                });
                return;
            }
            if (message.type === 'change' && typeof message.markdown === 'string') {
                void applyMarkdownFromWebview(message.markdown);
                return;
            }
            if (message.type === 'scroll' && typeof message.ratio === 'number') {
                lastKnownScrollRatio.set(key, message.ratio);
                if (message.anchor && typeof message.anchor.slug === 'string') {
                    lastKnownScrollAnchor.set(key, message.anchor);
                }
                return;
            }
            if (message.type === 'openLink' && typeof message.href === 'string') {
                void openLinkFromPreview(message.href, document.uri);
                return;
            }
            if (message.type === 'insertImage' && typeof message.dataUrl === 'string') {
                void this.savePastedImage(message.dataUrl, message.name, document, documentDir, webviewPanel.webview);
            }
        });

        webviewPanel.onDidDispose(() => {
            changeSub.dispose();
            themeSub.dispose();
            configSub.dispose();
            messageSub.dispose();
            if (pushTimer) clearTimeout(pushTimer);
            this.imageUriMaps.delete(key);
            this.frontmatterMaps.delete(key);
            syncEditorContext();
        });

        rememberMode(this.context, 'preview');
        debugLog(`[preview] Resolved Milkdown preview editor for ${key}`);
        syncEditorContext();
    }
}

function isPreviewTab(tab: vscode.Tab | undefined): vscode.Uri | undefined {
    if (!tab || !(tab.input instanceof vscode.TabInputCustom)) return undefined;
    if (tab.input.viewType !== VIEW_TYPE) return undefined;
    return tab.input.uri;
}

function findPreviewUri(): vscode.Uri | undefined {
    const fromActiveTab = isPreviewTab(vscode.window.tabGroups.activeTabGroup.activeTab);
    if (fromActiveTab) return fromActiveTab;

    for (const group of vscode.window.tabGroups.all) {
        if (!group.isActive) continue;
        for (const tab of group.tabs) {
            if (!tab.isActive) continue;
            const uri = isPreviewTab(tab);
            if (uri) return uri;
        }
    }

    for (const group of vscode.window.tabGroups.all) {
        for (const tab of group.tabs) {
            const uri = isPreviewTab(tab);
            if (uri) return uri;
        }
    }

    return undefined;
}

async function openLinkFromPreview(href: string, documentUri: vscode.Uri): Promise<void> {
    const trimmed = href.trim();
    if (!trimmed) return;

    if (/^https?:/i.test(trimmed)) {
        await vscode.env.openExternal(vscode.Uri.parse(trimmed));
        return;
    }

    if (trimmed.startsWith('#')) {
        return;
    }

    const targetPath = trimmed.startsWith('/')
        ? trimmed
        : path.resolve(path.dirname(documentUri.fsPath), trimmed);
    const targetUri = vscode.Uri.file(targetPath);

    try {
        await vscode.window.showTextDocument(targetUri, { preview: false });
    } catch {
        vscode.window.showWarningMessage(`Could not open link: ${trimmed}`);
    }
}

function isMarkdownResource(uri: vscode.Uri): boolean {
    const ext = path.extname(uri.fsPath).toLowerCase();
    return ext === '.md' || ext === '.markdown';
}

function syncEditorContext(): void {
    const previewUri = findPreviewUri();
    const editor = vscode.window.activeTextEditor;
    const isMarkdown =
        previewUri !== undefined ||
        editor?.document.languageId === 'markdown' ||
        (editor !== undefined && isMarkdownResource(editor.document.uri));

    void vscode.commands.executeCommand('setContext', PREVIEW_ACTIVE_CONTEXT, previewUri !== undefined);
    void vscode.commands.executeCommand('setContext', MARKDOWN_EDITOR_CONTEXT, isMarkdown);
}

function findTabs(matches: (tab: vscode.Tab) => boolean): vscode.Tab[] {
    const found: vscode.Tab[] = [];
    for (const group of vscode.window.tabGroups.all) {
        for (const tab of group.tabs) {
            if (matches(tab)) found.push(tab);
        }
    }
    return found;
}

function isTextTabForUri(uri: vscode.Uri): (tab: vscode.Tab) => boolean {
    const target = uri.toString();
    return (tab: vscode.Tab): boolean =>
        tab.input instanceof vscode.TabInputText && tab.input.uri.toString() === target;
}

function isPreviewTabForUri(uri: vscode.Uri): (tab: vscode.Tab) => boolean {
    const target = uri.toString();
    return (tab: vscode.Tab): boolean =>
        tab.input instanceof vscode.TabInputCustom &&
        tab.input.viewType === VIEW_TYPE &&
        tab.input.uri.toString() === target;
}

// 同じ URI を指すタブが新旧 2 枚同時に存在しないよう、新しいエディタを開いた後に古いタブを閉じる。
// (先に閉じてしまうと、ドキュメントが一瞬どのタブにも属さなくなり保存確認が出ることがあるため)
async function closeStaleTabs(tabs: vscode.Tab[]): Promise<void> {
    if (tabs.length === 0) return;
    await vscode.window.tabGroups.close(tabs, true);
}

async function switchToPreview(
    context: vscode.ExtensionContext,
    document: vscode.TextDocument,
    viewColumn: vscode.ViewColumn | undefined,
    editor?: vscode.TextEditor
): Promise<void> {
    const key = document.uri.toString();
    if (getConfig<boolean>('preview.syncScroll', true) && editor) {
        const line = editor.selection.active.line;
        const anchor = findScrollAnchor(document, line);
        if (anchor) {
            pendingOpenScrollAnchor.set(key, anchor);
        } else {
            pendingOpenScrollRatio.set(key, computeScrollRatio(editor) ?? 0);
        }
    }
    rememberMode(context, 'preview');
    const staleTextTabs = findTabs(isTextTabForUri(document.uri));
    await vscode.commands.executeCommand('vscode.openWith', document.uri, VIEW_TYPE, viewColumn);
    await closeStaleTabs(staleTextTabs);
}

async function switchToRaw(
    context: vscode.ExtensionContext,
    uri: vscode.Uri,
    viewColumn: vscode.ViewColumn | undefined
): Promise<void> {
    const key = uri.toString();
    const anchor = lastKnownScrollAnchor.get(key);
    const ratio = lastKnownScrollRatio.get(key);
    rememberMode(context, 'raw');
    const stalePreviewTabs = findTabs(isPreviewTabForUri(uri));
    await vscode.commands.executeCommand('vscode.openWith', uri, 'default', viewColumn);
    await closeStaleTabs(stalePreviewTabs);

    if (!getConfig<boolean>('preview.syncScroll', true)) return;
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.uri.toString() !== key) return;

    if (anchor) {
        revealAnchor(editor, anchor);
        return;
    }
    if (ratio !== undefined) {
        revealRatio(editor, ratio);
    }
}

export function activatePreviewFeature(context: vscode.ExtensionContext): void {
    const provider = new PreviewEditorProvider(context);

    syncEditorContext();

    // グローバルモードが raw のとき、アクティブな Preview タブを Raw に切り替える。
    // （Raw→Preview 方向は onDidChangeActiveTextEditor が担当。これで両方向対称になる）
    let enforcingRawMode = false;
    const enforceRawModeOnActiveTab = async (): Promise<void> => {
        if (enforcingRawMode) return;
        const mode = getRememberedMode(context) ?? getConfig<string>('preview.defaultMode', 'raw');
        if (mode !== 'raw') return;
        const previewUri = isPreviewTab(vscode.window.tabGroups.activeTabGroup.activeTab);
        if (!previewUri) return;
        enforcingRawMode = true;
        try {
            await switchToRaw(context, previewUri, vscode.ViewColumn.Active);
            syncEditorContext();
        } finally {
            enforcingRawMode = false;
        }
    };

    context.subscriptions.push(
        vscode.window.registerCustomEditorProvider(VIEW_TYPE, provider, {
            webviewOptions: { retainContextWhenHidden: true },
            supportsMultipleEditorsPerDocument: false
        }),

        vscode.window.tabGroups.onDidChangeTabs(() => {
            syncEditorContext();
            void enforceRawModeOnActiveTab();
        }),

        vscode.window.onDidChangeActiveTextEditor(() => {
            syncEditorContext();
        }),

        vscode.window.onDidChangeActiveColorTheme(() => {
            syncEditorContext();
        }),

        vscode.commands.registerCommand('markdownInline.openPreview', async () => {
            if (findPreviewUri()) return;

            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.document.languageId !== 'markdown') return;

            await switchToPreview(context, editor.document, editor.viewColumn, editor);
            syncEditorContext();
        }),

        vscode.commands.registerCommand('markdownInline.openRaw', async () => {
            const previewUri = findPreviewUri();
            if (!previewUri) return;

            await switchToRaw(context, previewUri, vscode.ViewColumn.Active);
            syncEditorContext();
        }),

        vscode.commands.registerCommand('markdownInline.togglePreview', async () => {
            const previewUri = findPreviewUri();
            if (previewUri) {
                await switchToRaw(context, previewUri, vscode.ViewColumn.Active);
                syncEditorContext();
                return;
            }
            const editor = vscode.window.activeTextEditor;
            if (editor && editor.document.languageId === 'markdown') {
                await switchToPreview(context, editor.document, editor.viewColumn, editor);
                syncEditorContext();
            }
        }),

        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (!editor || editor.document.languageId !== 'markdown') return;
            const remembered = getRememberedMode(context);
            const mode = remembered ?? getConfig<string>('preview.defaultMode', 'raw');
            if (mode === 'preview') {
                void switchToPreview(context, editor.document, editor.viewColumn, editor);
            }
        })
    );

    const initialEditor = vscode.window.activeTextEditor;
    if (initialEditor && initialEditor.document.languageId === 'markdown') {
        const remembered = getRememberedMode(context);
        const mode = remembered ?? getConfig<string>('preview.defaultMode', 'raw');
        if (mode === 'preview') {
            void switchToPreview(context, initialEditor.document, initialEditor.viewColumn, initialEditor);
        }
    }
}
