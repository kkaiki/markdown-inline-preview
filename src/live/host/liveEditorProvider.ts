/**
 * Live モードの host 側実装（CustomTextEditorProvider）。
 *
 * TextDocument をそのままバックエンドにするので、保存・dirty 状態・Undo/Redo は
 * VS Code 標準のテキストエディタと同じ仕組みで動く。webview 側（CodeMirror 6）とは
 * **差分だけ**をやり取りする（requirements.md R4.2 / architecture.md §4）。
 *
 *   host → webview  { type: 'init',  text, settings }
 *                   { type: 'apply', changes, revision }
 *   webview → host  { type: 'ready' }
 *                   { type: 'edit',  changes, revision }
 *
 * 全体置換は絶対にしない。全体置換をすると Undo 履歴と Git 差分が壊れる。
 */
import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { buildPreviewCsp } from '../../preview/host/csp';
import { changeToRange, createEchoGuard, type DocChange } from '../shared/documentSync';
import { buildLiveWebviewHtml } from '../shared/liveWebviewHtml';
import { exportToPdfLocal } from './localExport';

const execFileAsync = promisify(execFile);

export const LIVE_VIEW_TYPE = 'ipreview.live';

/**
 * Git HEAD 版のファイル本文。git 管理外・新規ファイルなら null。
 * Live モードのドキュメントは生 Markdown なので、frontmatter も含めてそのまま比較する。
 */
async function getGitHeadText(fsPath: string): Promise<string | null> {
    try {
        const { stdout } = await execFileAsync('git', ['show', `HEAD:./${path.basename(fsPath)}`], {
            cwd: path.dirname(fsPath),
            maxBuffer: 16 * 1024 * 1024
        });
        return stdout;
    } catch {
        return null;
    }
}

interface EditMessage {
    type: 'edit';
    changes: DocChange[];
    revision: number;
}

function nonce(): string {
    return crypto.randomBytes(16).toString('base64');
}

function html(webview: vscode.Webview, extensionUri: vscode.Uri): string {
    const asset = (name: string): string =>
        webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', name)).toString();
    // CSP と script タグで同じ nonce を使う（別々に採番するとスクリプトがブロックされる）
    const n = nonce();
    return buildLiveWebviewHtml({
        scriptUri: asset('live.bundle.js'),
        styleUri: asset('live-preview.css'),
        katexStyleUri: asset('katex.min.css'),
        csp: buildPreviewCsp(webview.cspSource, n),
        nonce: n
    });
}

/** PDF 書き出し。失敗しても webview は壊さず、メッセージだけ出す。 */
async function exportPdf(document: vscode.TextDocument, extensionPath: string): Promise<void> {
    try {
        await exportToPdfLocal(document, extensionPath);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        void vscode.window.showErrorMessage(vscode.l10n.t('PDF export failed: {0}', msg));
    }
}

class LiveEditorProvider implements vscode.CustomTextEditorProvider {
    constructor(private readonly extensionUri: vscode.Uri) {}

    resolveCustomTextEditor(
        document: vscode.TextDocument,
        panel: vscode.WebviewPanel,
        _token: vscode.CancellationToken
    ): void {
        const echo = createEchoGuard();
        const extensionPath = this.extensionUri.fsPath;
        panel.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')]
        };
        panel.webview.html = html(panel.webview, this.extensionUri);

        /** webview 起点の編集を適用している間は、その変更を webview へ送り返さない。 */
        let applyingFromWebview = false;

        const post = (message: unknown): void => {
            void panel.webview.postMessage(message);
        };

        const sendInit = (): void => {
            post({
                type: 'init',
                text: document.getText(),
                settings: {
                    showLineNumbers: vscode.workspace
                        .getConfiguration('markdownInline')
                        .get<boolean>('live.showLineNumbers', true),
                    showDiffGutter: vscode.workspace
                        .getConfiguration('markdownInline')
                        .get<boolean>('live.showDiffGutter', true),
                    showToolbar: vscode.workspace
                        .getConfiguration('markdownInline')
                        .get<boolean>('live.showToolbar', true),
                    enableSlashMenu: vscode.workspace
                        .getConfiguration('markdownInline')
                        .get<boolean>('live.enableSlashMenu', true)
                }
            });
        };

        /** Git HEAD 版を取り直して webview へ送る（差分ガターの基準）。 */
        const sendDiffBase = async (): Promise<void> => {
            if (document.uri.scheme !== 'file') return;
            post({ type: 'diffBase', text: await getGitHeadText(document.uri.fsPath) });
        };

        const messageSub = panel.webview.onDidReceiveMessage(async (msg: EditMessage | { type: string }) => {
            if (msg.type === 'ready') {
                sendInit();
                void sendDiffBase();
                return;
            }
            if (msg.type === 'exportPdf') {
                await exportPdf(document, extensionPath);
                return;
            }
            if (msg.type === 'switchMode') {
                // ツールバーからのモード切替。同じタブで開き直す。
                const mode = (msg as { mode?: string }).mode;
                await vscode.commands.executeCommand(
                    'vscode.openWith',
                    document.uri,
                    mode === 'preview' ? 'ipreview.preview' : 'default'
                );
                return;
            }
            if (msg.type !== 'edit') return;
            const edit = msg as EditMessage;
            const text = document.getText();
            const wsEdit = new vscode.WorkspaceEdit();
            // 後ろから当てることで、前方の編集による位置ずれを避ける。
            const ordered = [...edit.changes].sort((a, b) => b.from - a.from);
            for (const c of ordered) {
                const r = changeToRange(text, c);
                wsEdit.replace(
                    document.uri,
                    new vscode.Range(r.start.line, r.start.character, r.end.line, r.end.character),
                    r.insert
                );
            }
            applyingFromWebview = true;
            try {
                await vscode.workspace.applyEdit(wsEdit);
            } finally {
                applyingFromWebview = false;
            }
        });

        const changeSub = vscode.workspace.onDidChangeTextDocument((e) => {
            if (e.document.uri.toString() !== document.uri.toString()) return;
            if (applyingFromWebview) return; // webview 起点の編集はエコーバックしない
            if (e.contentChanges.length === 0) return;
            const changes: DocChange[] = e.contentChanges.map((c) => ({
                from: c.rangeOffset,
                to: c.rangeOffset + c.rangeLength,
                insert: c.text
            }));
            post({ type: 'apply', changes, revision: undefined });
        });

        // webview 側の bundle 読み込み完了を待たずに init が飛ぶのを避けるため、
        // 'ready' を受けてから送る。取りこぼし対策として一度だけ遅延送信もする。
        const kick = setTimeout(() => {
            sendInit();
            void sendDiffBase();
        }, 500);

        // 保存のたびに HEAD 版を取り直す（コミット直後などに差分が残らないように）
        const saveSub = vscode.workspace.onDidSaveTextDocument((saved) => {
            if (saved.uri.toString() === document.uri.toString()) void sendDiffBase();
        });

        panel.onDidDispose(() => {
            clearTimeout(kick);
            messageSub.dispose();
            changeSub.dispose();
            saveSub.dispose();
            echo.pending();
        });
    }
}

/** アクティブなタブから Markdown の TextDocument を得る（custom editor でも拾えるように）。 */
async function activeMarkdownDocument(): Promise<vscode.TextDocument | undefined> {
    const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input as { uri?: vscode.Uri } | undefined;
    if (!input?.uri) return undefined;
    return vscode.workspace.openTextDocument(input.uri);
}

export function activateLiveFeature(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.window.registerCustomEditorProvider(LIVE_VIEW_TYPE, new LiveEditorProvider(context.extensionUri), {
            webviewOptions: { retainContextWhenHidden: true },
            supportsMultipleEditorsPerDocument: false
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('markdownInline.exportPdf', async () => {
            const doc =
                vscode.window.activeTextEditor?.document ??
                (await activeMarkdownDocument());
            if (!doc) return;
            await exportPdf(doc, context.extensionUri.fsPath);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('markdownInline.openLive', async () => {
            const uri = vscode.window.activeTextEditor?.document.uri;
            if (!uri) return;
            await vscode.commands.executeCommand('vscode.openWith', uri, LIVE_VIEW_TYPE);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('markdownInline.toggleLive', async () => {
            const active = vscode.window.tabGroups.activeTabGroup.activeTab;
            const input = active?.input as { uri?: vscode.Uri; viewType?: string } | undefined;
            const uri = input?.uri ?? vscode.window.activeTextEditor?.document.uri;
            if (!uri) return;
            const isLive = input?.viewType === LIVE_VIEW_TYPE;
            await vscode.commands.executeCommand(
                'vscode.openWith',
                uri,
                isLive ? 'default' : LIVE_VIEW_TYPE
            );
        })
    );
}
