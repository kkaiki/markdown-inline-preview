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
    shouldIncludeCredit,
    shouldShowProBadge,
    shouldPromptBeforeExport,
    proFeatureAccess,
    MONETIZATION_ENABLED,
    type CreditLineSetting
} from '../../shared/license/entitlement';
import { FEATURE_PDF_STYLING } from '../../shared/license/token';
import { DEFAULT_PDF_STYLING, isDefaultPdfStyling, readPdfStyling, type PdfStyling } from '../../shared/pdfStyling';
import { showProLockedDialog } from '../../license/proGate';
import type { LicenseVerifyResult } from '../../shared/license/token';
import {
    computeEditorAssociations,
    editorAssociationsEqual,
    resolveDefaultOpenMode,
    type LiveMode
} from './defaultEditorAssociation';
import { fileMode, rememberFileMode, tabsToClose, type ModeMemory, type TabLike } from './modeMemory';
import { chooseDocumentGroup, type GroupTabLike } from './editorGroups';

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
 * `.md` の既定エディタ（`workbench.editorAssociations`）を既定モードへ追従させる。
 *
 * customEditor の `priority: "default"` は**拡張機能側の「希望」でしかなく、尊重しない
 * 環境がある**（ユーザー報告 2026-09-12: Cursor では左サイドバーからクリックすると
 * 素のテキストエディタが先に開き、そのあと Live へ切り替わって Raw タブが閉じる＝ちらつく）。
 * 一方 `workbench.editorAssociations` はユーザー設定なので拡張機能の宣言より強く、
 * 「開く前から解決先が1つに確定している」状態を作れる。
 *
 * 関連付けは**グローバルな glob 指定**でファイル単位にはできないので、ここは既定モード
 * （`live.defaultMode`）に合わせるだけにして、記憶が既定と違うファイルは
 * `resolveCustomTextEditor` の跳ね返しで反対のモードへ開き直す。
 *
 * `live.controlDefaultEditor` が OFF のときは**自分が書いた値だけ**取り除く
 * （ユーザーが他拡張のビューアへ向けている設定は残す）。
 */
async function syncManagedEditorAssociation(): Promise<void> {
    const config = vscode.workspace.getConfiguration('markdownInline');
    const desired = config.get<boolean>('live.controlDefaultEditor', true)
        ? resolveDefaultOpenMode({ defaultMode: config.get<string>('live.defaultMode', 'live') })
        : null;
    const workbench = vscode.workspace.getConfiguration('workbench');
    const current = workbench.get<Record<string, string>>('editorAssociations');
    const next = computeEditorAssociations(current, desired);
    if (editorAssociationsEqual(current, next)) return;
    try {
        await workbench.update('editorAssociations', next, vscode.ConfigurationTarget.Global);
    } catch {
        // 設定を書けない環境では黙って諦める（priority: default と applyRememberedMode が受け皿）
    }
}

/** そのタブが本文を編集するタブ（テキスト・カスタムエディタ・差分・ノートブック）か。 */
function isDocumentTab(tab: vscode.Tab): boolean {
    const input = tab.input;
    return (
        input instanceof vscode.TabInputText ||
        input instanceof vscode.TabInputCustom ||
        input instanceof vscode.TabInputNotebook ||
        input instanceof vscode.TabInputTextDiff ||
        input instanceof vscode.TabInputNotebookDiff
    );
}

/** そのタブが `uri` を開いているか。 */
function tabUri(tab: vscode.Tab): string | undefined {
    return (tab.input as { uri?: vscode.Uri } | undefined)?.uri?.toString();
}

/**
 * Markdown が「パネルだけのエディタグループ」に開かれてしまったときに、文書を並べている
 * グループへ移す。
 *
 * VS Code は新しいエディタを**アクティブなグループ**へ開くため、Claude Code のセッションや
 * ターミナルを開いている側にフォーカスがあると、作業していない方のグループに .md が開く
 * （ユーザー報告 2026-09-12）。移動先の判定は `chooseDocumentGroup`（純関数）。
 */
async function relocateOutOfPanelGroup(uri: vscode.Uri): Promise<void> {
    const config = vscode.workspace.getConfiguration('markdownInline');
    if (!config.get<boolean>('live.avoidPanelGroup', true)) return;

    const groups = vscode.window.tabGroups.all;
    const landing = groups.findIndex(
        (g) => g.isActive && g.tabs.some((t) => t.isActive && tabUri(t) === uri.toString())
    );
    // アクティブなタブでないなら `moveActiveEditor` は別のエディタを動かしてしまうので触らない
    if (landing === -1) return;

    const mapped: GroupTabLike[][] = groups.map((g) =>
        g.tabs.map((t) =>
            isDocumentTab(t) ? { kind: 'document', uri: tabUri(t) } : { kind: 'panel' }
        )
    );
    const target = chooseDocumentGroup(mapped, landing, uri.toString());
    if (target === null) return;

    await vscode.commands.executeCommand('moveActiveEditor', {
        to: 'position',
        by: 'group',
        value: target + 1
    });
}

/** 今 Live へ切り替え中の URI（再入して無限ループになるのを防ぐ）。 */
const switching = new Set<string>();

/**
 * 素のテキストエディタで開かれた Markdown を、記憶しているモードへ合わせる。
 *
 * 入口（CLI / エクスプローラ / クイックオープン）によらず**同じ経路**を通るので、
 * 「cli は raw、サイドバーは live」のような割れ方をしない。
 */
async function applyRememberedMode(
    context: vscode.ExtensionContext,
    document: vscode.TextDocument
): Promise<void> {
    if (document.languageId !== 'markdown') return;
    if (document.uri.scheme !== 'file') return;
    const key = document.uri.toString();
    if (switching.has(key)) return;
    if (openModeFor(context, document.uri) !== 'live') return;

    switching.add(key);
    try {
        await vscode.commands.executeCommand('vscode.openWith', document.uri, LIVE_VIEW_TYPE);
    } finally {
        setTimeout(() => switching.delete(key), 1000);
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

/** 未購入のときのフォールバック（ライセンス機能が登録される前に呼ばれた場合）。 */
const NO_LICENSE: LicenseVerifyResult = { ok: false, reason: 'malformed' };

/**
 * SecretStorage を読む窓口。`activate()` から注入される。
 * ここを直接 import すると host 層が拡張のライフサイクルに依存してしまうため、
 * setter で受け取る形にしている。
 */
let licenseStore: { verify(): Promise<LicenseVerifyResult> } | undefined;

/** 「クレジット行を消す」案内を出した回数の記録先。毎回出すとうるさいので間引く。 */
let upsellMemento: vscode.Memento | undefined;

export function setLicenseStore(
    store: { verify(): Promise<LicenseVerifyResult> },
    memento?: vscode.Memento
): void {
    licenseStore = store;
    upsellMemento = memento;
}

const UPSELL_COUNT_KEY = 'markdownInline.export.creditExportCount';

/** クレジット行付きで書き出した回数を1つ進めて返す（`shouldPromptBeforeExport` の間引き判定に使う）。 */
async function nextCreditExportCount(): Promise<number> {
    if (!upsellMemento) return 1; // 記録先が無ければ「毎回1回目」扱い（安全側＝出す）
    const count = (upsellMemento.get<number>(UPSELL_COUNT_KEY) ?? 0) + 1;
    await upsellMemento.update(UPSELL_COUNT_KEY, count);
    return count;
}

/** 書き出し前の確認ダイアログの結果。 */
type ExportPromptDecision = 'export' | 'upgrade' | 'cancel';

/**
 * 「このまま無料で出すか、購入して消すか」を書き出しの**前**に確認する
 * （ユーザー指示 2026-09-28:「毎回クレジットは入るがその前にポップアップで
 * 課金する稼働かを確認するようにしてから一手間つけてから、pdf の書き出しに移る」）。
 */
async function confirmExportWithCredit(): Promise<ExportPromptDecision> {
    const continueLabel = vscode.l10n.t('Export with credit line (free)');
    const upgradeLabel = vscode.l10n.t('Remove credit line (one-time purchase)');
    const choice = await vscode.window.showInformationMessage(
        vscode.l10n.t('This PDF will include a small credit line at the bottom of each page.'),
        { modal: true },
        continueLabel,
        upgradeLabel
    );
    if (choice === upgradeLabel) return 'upgrade';
    if (choice === continueLabel) return 'export';
    return 'cancel'; // Esc・ダイアログを閉じた
}

/** PDF 書き出し。失敗しても webview は壊さず、メッセージだけ出す。 */
async function exportPdf(document: vscode.TextDocument, extensionPath: string): Promise<void> {
    const setting = vscode.workspace
        .getConfiguration('markdownInline')
        .get<CreditLineSetting>('export.creditLine', 'auto');

    // ここでネットワークに出ない。書き出しを待たせないため、判定はローカルの
    // 保存済みトークンだけで行う（更新は起動時と 24 時間ごとに裏で走る）。
    const license = (await licenseStore?.verify()) ?? NO_LICENSE;

    const credit = shouldIncludeCredit({
        license,
        monetizationEnabled: MONETIZATION_ENABLED,
        setting
    });

    // PDF の体裁（PRO+）。既定のままなら判定しない。販売前は黙って既定の体裁で書き出す
    const requested = readPdfStyling((key) =>
        vscode.workspace.getConfiguration('markdownInline').get(`export.pdf.${key}`)
    );
    let styling: PdfStyling = DEFAULT_PDF_STYLING;
    let upsellShown = false;
    if (!isDefaultPdfStyling(requested)) {
        const access = proFeatureAccess({ license, monetizationEnabled: MONETIZATION_ENABLED, feature: FEATURE_PDF_STYLING });
        if (access === 'allowed') {
            styling = requested;
        } else if (access === 'locked') {
            const decision = await showProLockedDialog(
                vscode.l10n.t('PDF layout options'),
                vscode.l10n.t('Export without layout options')
            );
            if (decision !== 'continue') return;
            upsellShown = true; // この回はクレジット行の確認を重ねて出さない
        }
    }

    if (credit && !upsellShown) {
        const exportCount = await nextCreditExportCount();
        if (shouldPromptBeforeExport({ license, monetizationEnabled: MONETIZATION_ENABLED, exportCount })) {
            const decision = await confirmExportWithCredit();
            if (decision === 'cancel') return;
            if (decision === 'upgrade') {
                await vscode.commands.executeCommand('markdownInline.upgradeToPro');
                return; // 購入ページを開いただけ。今回は書き出さない
            }
            // decision === 'export' → このまま下へ進んで書き出す
        }
    }

    try {
        await exportToPdfLocal(document, extensionPath, { credit, styling });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        void vscode.window.showErrorMessage(vscode.l10n.t('PDF export failed: {0}', msg));
        return;
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
        if (openModeFor(this.context, document.uri) === 'raw') {
            // customEditor の priority が default なので、Raw と記憶したファイルも
            // 一度はここへ来てしまう。webview は作らず、素のエディタへ即座に開き直す（跳ね返し）。
            // 今 resolveCustomTextEditor 中のこのタブ自身が閉じられずに残ってしまうため、
            // 開き直す前に閉じる（他のコマンドの switchMode 等と同じ順序）。
            void (async () => {
                await closeOppositeTabs(document.uri, 'raw');
                await vscode.commands.executeCommand('vscode.openWith', document.uri, 'default');
            })();
            return;
        }

        const echo = createEchoGuard();
        const extensionPath = this.extensionUri.fsPath;

        // Live で開かれた＝このファイルは Live で使う、と覚える
        void rememberMode(this.context, document.uri, 'live');

        /*
         * Claude Code のセッションやターミナルだけのグループに開かれていたら、文書を
         * 並べているグループへ移す。タブはまだ tabGroups に現れていないことがあるので、
         * 「今」「アクティブになったとき」「少し後」の3回試す（移動が要らなければ no-op）。
         */
        const relocate = (): void => void relocateOutOfPanelGroup(document.uri);
        relocate();
        const viewStateSub = panel.onDidChangeViewState(() => {
            if (panel.active) relocate();
        });
        panel.onDidDispose(() => viewStateSub.dispose());
        setTimeout(relocate, 200);
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

        const sendInit = async (): Promise<void> => {
            // 保存済みトークンだけで判定する（ネットワークには出ない）。PDF ボタンの PRO+ バッジ用
            const license = (await licenseStore?.verify().catch(() => undefined)) ?? NO_LICENSE;
            post({
                type: 'init',
                text: document.getText(),
                settings: {
                    // UI 文字列の言語（既定は英語、日本語のエディタなら日本語）
                    locale: vscode.env.language,
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
                        .get<boolean>('live.enableSlashMenu', true),
                    showProBadge: shouldShowProBadge({ license, monetizationEnabled: MONETIZATION_ENABLED })
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
                // diffBase は init で作られる editor に対して送るので、init を先に届ける
                await sendInit();
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
            void sendInit().then(() => sendDiffBase());
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
    // 既定エディタの関連付けを既定モードへ追従させる（priority: default だけでは
    // 素の Raw を経由してしまう環境があるため）。設定変更にも追従する。
    void syncManagedEditorAssociation();
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (
                e.affectsConfiguration('markdownInline.live.controlDefaultEditor') ||
                e.affectsConfiguration('markdownInline.live.defaultMode')
            ) {
                void syncManagedEditorAssociation();
            }
        })
    );

    /*
     * 素のテキストエディタで Markdown が開かれたら、記憶しているモードへ合わせる。
     * 入口（CLI / エクスプローラ / クイックオープン）によらずここを通るので挙動が揃う。
     */
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (!editor) return;
            void applyRememberedMode(context, editor.document);
            // Raw のまま使うファイルも、パネルだけのグループに開かれたら文書側へ移す
            if (editor.document.languageId === 'markdown' && editor.document.uri.scheme === 'file') {
                void relocateOutOfPanelGroup(editor.document.uri);
            }
        })
    );
    if (vscode.window.activeTextEditor) {
        void applyRememberedMode(context, vscode.window.activeTextEditor.document);
    }

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
