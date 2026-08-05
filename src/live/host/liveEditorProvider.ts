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
import { buildPreviewCsp } from './csp';
import { changeToRange, createEchoGuard, type DocChange } from '../shared/documentSync';
import { buildLiveWebviewHtml } from '../shared/liveWebviewHtml';
import { exportToPdfLocal } from './localExport';
import {
    computeEditorAssociations,
    editorAssociationsEqual,
    resolveDefaultOpenMode,
    type LiveMode
} from './defaultEditorAssociation';
import { fileMode, rememberFileMode, tabsToClose, type ModeMemory, type TabLike } from './modeMemory';

const execFileAsync = promisify(execFile);

export const LIVE_VIEW_TYPE = 'ipreview.live';

/** ファイルごとのモード記憶。 */
const MODE_MEMORY_KEY = 'markdownInline.liveModeByFile';

function loadMemory(context: vscode.ExtensionContext): ModeMemory {
    return context.globalState.get<ModeMemory>(MODE_MEMORY_KEY) ?? {};
}

/**
 * そのファイルを次にどのモードで開くかを決める。
 *
 * **記憶はファイルごと**（ユーザー指示 2026-08-05）。一度 Raw にしたファイルは
 * 以降ずっと Raw で開き、他のファイルは既定（Live）のまま。
 */
function openModeFor(context: vscode.ExtensionContext, uri: vscode.Uri): LiveMode {
    const config = vscode.workspace.getConfiguration('markdownInline');
    const remembered = config.get<boolean>('live.rememberMode', true)
        ? fileMode(loadMemory(context), uri.toString())
        : undefined;
    return resolveDefaultOpenMode({
        remembered,
        defaultMode: config.get<string>('live.defaultMode', 'live')
    });
}

/** そのファイルで使ったモードを覚える。 */
async function rememberMode(
    context: vscode.ExtensionContext,
    uri: vscode.Uri,
    mode: LiveMode
): Promise<void> {
    const memory = loadMemory(context);
    if (fileMode(memory, uri.toString()) === mode) return;
    await context.globalState.update(MODE_MEMORY_KEY, rememberFileMode(memory, uri.toString(), mode));
}

/** 開いているタブを純ロジック用の形へ詰め替える。 */
function listTabs(): { tab: vscode.Tab; like: TabLike }[] {
    const out: { tab: vscode.Tab; like: TabLike }[] = [];
    for (const group of vscode.window.tabGroups.all) {
        for (const tab of group.tabs) {
            const input = tab.input as { uri?: vscode.Uri; viewType?: string } | undefined;
            if (!input?.uri) continue;
            out.push({ tab, like: { uri: input.uri.toString(), viewType: input.viewType } });
        }
    }
    return out;
}

/**
 * 同じファイルが Raw タブと Live タブで二重に開かれないようにする
 * （ユーザー指示 2026-08-05:「raw live どちらかのタブだけが開かれるように」）。
 */
async function closeOppositeTabs(uri: vscode.Uri, mode: LiveMode): Promise<void> {
    const tabs = listTabs();
    const indexes = tabsToClose(tabs.map((t) => t.like), uri.toString(), mode);
    if (indexes.length === 0) return;
    await vscode.window.tabGroups.close(
        indexes.map((i) => tabs[i].tab),
        // 保存を促さない（同じドキュメントが別タブで開いているだけなので内容は失われない）
        true
    );
}

/**
 * `workbench.editorAssociations` を現在のモードへ合わせる。
 *
 * customEditor の priority だけでは、同じパターンを主張する他拡張と競合したときに
 * 解決先が一意にならない。ユーザー設定であるこちらを書くことで、開く前から
 * 解決先を1つに確定させる。
 */
async function applyDefaultEditorAssociation(): Promise<void> {
    const config = vscode.workspace.getConfiguration('markdownInline');
    const controlled = config.get<boolean>('live.controlDefaultEditor', true);
    /*
     * `workbench.editorAssociations` はグローバル設定なのでファイル単位にはできない。
     * ここでは**既定モード**に合わせ、記憶が既定と違うファイルは開いた直後に
     * 反対のモードへ開き直す（resolveCustomTextEditor の跳ね返し）。
     */
    const desired = controlled
        ? (config.get<string>('live.defaultMode', 'live') === 'raw' ? 'raw' : 'live')
        : null;
    const workbench = vscode.workspace.getConfiguration('workbench');
    const current = workbench.get<Record<string, string>>('editorAssociations');
    const next = computeEditorAssociations(current, desired);
    if (editorAssociationsEqual(current, next)) return;
    try {
        await workbench.update('editorAssociations', next, vscode.ConfigurationTarget.Global);
    } catch {
        // 設定を書けない環境（制限モード等）では黙って諦める
    }
}

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
    constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly context: vscode.ExtensionContext
    ) {}

    resolveCustomTextEditor(
        document: vscode.TextDocument,
        panel: vscode.WebviewPanel,
        _token: vscode.CancellationToken
    ): void {
        const echo = createEchoGuard();
        const extensionPath = this.extensionUri.fsPath;

        if (openModeFor(this.context, document.uri) === 'raw') {
            // このファイルは Raw で使うと覚えているので、素のエディタへ開き直す
            void vscode.commands.executeCommand('vscode.openWith', document.uri, 'default');
            return;
        }
        void rememberMode(this.context, document.uri, 'live');
        void closeOppositeTabs(document.uri, 'live');
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
                // ツールバーからの明示的な切り替え。そのファイルは以降 Raw で開く。
                await rememberMode(this.context, document.uri, 'raw');
                await closeOppositeTabs(document.uri, 'raw');
                await vscode.commands.executeCommand('vscode.openWith', document.uri, 'default');
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

/** アクティブなタブの URI（custom editor でも拾えるように）。 */
function activeMarkdownUri(): vscode.Uri | undefined {
    const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input as { uri?: vscode.Uri } | undefined;
    return input?.uri ?? vscode.window.activeTextEditor?.document.uri;
}

/** アクティブなタブから Markdown の TextDocument を得る。 */
async function activeMarkdownDocument(): Promise<vscode.TextDocument | undefined> {
    const uri = activeMarkdownUri();
    if (!uri) return undefined;
    return vscode.workspace.openTextDocument(uri);
}

export function activateLiveFeature(context: vscode.ExtensionContext): void {
    // 起動時に、記憶しているモード（初回は Live）へ既定エディタを合わせる
    void applyDefaultEditorAssociation();

    /*
     * モードの記憶は**明示的にモードを選んだときだけ**行う。
     *
     * 「素のテキストエディタが前面に来たら Raw」と自動判定すると、拡張がアクティブに
     * なる前にウィンドウ復元で開かれたファイルまで Raw と覚えてしまい、以後ずっと
     * Raw に張り付く（2026-08-05 に実際に踏んだ）。記憶する経路は
     *   - Live エディタが実際に開かれた（resolveCustomTextEditor）
     *   - `openLive` / `toggleLive` コマンド
     *   - ツールバーの Raw ボタン（switchMode メッセージ）
     * の3つだけに絞る。
     */

    context.subscriptions.push(
        vscode.window.registerCustomEditorProvider(
            LIVE_VIEW_TYPE,
            new LiveEditorProvider(context.extensionUri, context),
            {
                webviewOptions: { retainContextWhenHidden: true },
                supportsMultipleEditorsPerDocument: false
            }
        )
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
        // 引数の uri はエクスプローラの右クリックから渡ってくる
        vscode.commands.registerCommand('markdownInline.openLive', async (resource?: vscode.Uri) => {
            const uri = resource ?? activeMarkdownUri();
            if (!uri) return;
            await rememberMode(context, uri, 'live');
            await closeOppositeTabs(uri, 'live');
            await vscode.commands.executeCommand('vscode.openWith', uri, LIVE_VIEW_TYPE);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('markdownInline.toggleLive', async (resource?: vscode.Uri) => {
            const active = vscode.window.tabGroups.activeTabGroup.activeTab;
            const input = active?.input as { uri?: vscode.Uri; viewType?: string } | undefined;
            const uri = resource ?? input?.uri ?? vscode.window.activeTextEditor?.document.uri;
            if (!uri) return;
            const next: LiveMode = input?.viewType === LIVE_VIEW_TYPE ? 'raw' : 'live';
            await rememberMode(context, uri, next);
            await closeOppositeTabs(uri, next);
            await vscode.commands.executeCommand(
                'vscode.openWith',
                uri,
                next === 'live' ? LIVE_VIEW_TYPE : 'default'
            );
        })
    );
}
