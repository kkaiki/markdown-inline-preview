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
import * as fs from 'fs';
import * as crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { exportToPdfLocal } from './localExport';

import type { PreviewSettings, ScrollAnchorPayload } from '../webview/types';
import { prepareMarkdownImagesForWebview, restoreMarkdownImagesFromWebview } from './markdownTransform';
import { buildPreviewCsp } from './csp';
import { splitFrontmatter, mergeFrontmatter } from '../../shared/markdown/frontmatter';
import { repairNestedCodeFences } from '../../shared/markdown/codeFence';
import { findScrollAnchor, findLineBySlug } from '../../shared/structure/scrollAnchor';
import { scrollRatioFromLine, lineFromScrollRatio } from '../../shared/preview/scrollSync';
import { rawToCursorAnchor, cursorAnchorToRaw, type CursorAnchor } from '../../shared/preview/cursorAnchor';
import { pickPreviewUri, type PreviewTabInfo } from './previewTabs';
import { decidePreviewToggle } from './toggleDecision';
import { createSerialQueue, reportRejection } from './serialQueue';
import { resolveExternalPush, resolveWebviewSaveDecision } from './externalEcho';
import {
    computeEditorAssociations,
    editorAssociationsEqual,
    resolveDefaultOpenMode
} from './defaultEditorAssociation';
import { resolveControlDefaultEditor, resolveShowLineNumbers } from '../../core';

const execFileAsync = promisify(execFile);

/** Git HEAD 版のファイル本文（frontmatter 除去後）。git 管理外/新規なら null。 */
async function getGitHeadBody(fsPath: string): Promise<string | null> {
    const dir = path.dirname(fsPath);
    const base = path.basename(fsPath);
    try {
        const { stdout } = await execFileAsync('git', ['show', `HEAD:./${base}`], {
            cwd: dir,
            maxBuffer: 16 * 1024 * 1024
        });
        return splitFrontmatter(stdout).body;
    } catch {
        return null;
    }
}

type DebugLogFunction = (message: string, ...args: unknown[]) => void;

let debugLog: DebugLogFunction = () => {};

export function setDebugLog(logFn: DebugLogFunction): void {
    debugLog = logFn;
}

const VIEW_TYPE = 'ipreview.preview';
const GLOBAL_MODE_KEY = 'markdownInline.previewMode';
const PREVIEW_ACTIVE_CONTEXT = 'ipreview.previewActive';
const MARKDOWN_EDITOR_CONTEXT = 'ipreview.markdownEditor';

// 画面下部に常時出すモード切り替えトグル。Cursor のタイトルバーは幅が狭いと
// アイコンを「…」へ折りたたむため、確実に見える保険としてステータスバーにも置く。
let modeStatusBarItem: vscode.StatusBarItem | undefined;

// Preview を開く直前のスクロール状態（resolveCustomTextEditor の init で消費）
const pendingOpenScrollRatio = new Map<string, number>();
const pendingOpenScrollAnchor = new Map<string, ScrollAnchorPayload>();
const lastKnownScrollRatio = new Map<string, number>();
const lastKnownScrollAnchor = new Map<string, ScrollAnchorPayload>();
// カーソル位置の引き継ぎ。Raw→Preview は pendingOpenCursor（init で消費）、
// Preview→Raw は WebView から逐次受け取る lastKnownCursor を使う。
const pendingOpenCursor = new Map<string, CursorAnchor>();
const lastKnownCursor = new Map<string, CursorAnchor>();
// Preview → Raw へ切り替える直前に、その Preview の webview 由来の直列化キュー
// （enqueueWebviewChange）に積まれたまま未実行の書き込みを完了させるためのフラッシュ関数。
// これを待たずに switchToRaw すると、直前の編集（タイプ直後にすぐトグルした場合など）の
// 書き込みが完了する前に Preview の webview が破棄され、その編集が Raw に反映されずに
// 失われることがある（詳細: docs/specifications/fixes/preview-to-raw-pending-edit-loss-fix.md）。
const pendingWebviewFlush = new Map<string, () => Promise<void>>();
// switchToPreview() / switchToRaw() が処理中の URI。どちらも意図的な切替の
// 途中は、同じグループ内に Preview タブと Raw タブが一時的に並存する（openWith
// 後、古いタブを closeStaleTabs で閉じるまでの間）。この期間に
// collapseDuplicateRawTabsForOpenPreviews が同時に同じタブへ openWith/close を
// 行うと、意図した切替先と競合したり VS Code 側のタブ操作と衝突したりする
// （dirty な文書の Raw→Preview→Raw 往復で "Illegal argument: TextEditor" が
// 発生する回帰が実際に起きた）ため、対象 URI をここに登録して除外する。
// switchToPreview/switchToRaw は自分自身で古いタブの後始末を完結させるので、
// この Set に入っている間は collapse 処理が横から手を出す必要が無い。
const inFlightSwitch = new Set<string>();
// Preview の webview（Custom Editor タブ）が resolveCustomTextEditor で作られた
// 時刻。重複解消（collapseDuplicateRawTabForActiveEditor）は、この時刻から一定時間
// 以上経った「安定して開いている」Preview タブに対してのみ発動する。モード記憶
// 機能が新規ファイルを自動で Preview 化した直後に、それを打ち消す形で Raw が
// 開かれるケース（ごく短時間のうちに Preview 化→Raw 強制が連続するケース）まで
// 重複とみなして手を出すと、Raw への意図的な切替と衝突して無限にタブの
// 開閉を繰り返してしまう。詳細: docs/specifications/fixes/sidebar-reopen-preview-duplicate-tab-fix.md
const previewSettledAt = new Map<string, number>();
const DUPLICATE_COLLAPSE_SETTLE_MS = 500;

// 「このセッションで既に開いた（=モードを尊重すべき既存の）Markdown ファイル」の URI。
// 拡張機能の起動時点で開いていたタブと、その後アクティブになった／resolveCustomTextEditor
// で解決されたファイルを記録する。ここに含まれない URI が初めて解決/アクティブになった
// ときだけ「新規オープン」とみなし、記憶した最後のモード（または既定設定）を適用する。
// 既存ファイルにはモードを強制しない。
// `PreviewEditorProvider.resolveCustomTextEditor`（customEditors priority: "default" 化に伴う
// Raw への跳ね返し判定）と `activatePreviewFeature` 内の `onDidChangeActiveTextEditor` の
// 両方から参照するため、モジュールスコープに置く。
const seenMarkdownUris = new Set<string>();

// テスト専用シーム: webview の中身（Milkdown/JS）は @vscode/test-electron のテストから
// 駆動できない（実 DOM・実 IME に触れる手段が無い）ため、webview からの `change` メッセージ
// 受信時と全く同じ経路（enqueueWebviewChange → applyMarkdownFromWebview。ディスク read・
// WorkspaceEdit・save・fileWatcher エコー判定を含む実タイミング）を直接呼び出せるようにする。
// 本番では未使用（`activatePreviewFeature` が `ExtensionMode.Test` の時だけコマンドとして
// 公開する。src/preview/webview/milkdownApp.ts の `__IPREVIEW_TEST_HOOK__` と同じ発想）。
const testChangeInjectors = new Map<string, (markdown: string) => Promise<void>>();
// 同様に、webview からの `openLink` メッセージ受信と同じ経路（openLinkFromPreview、
// webviewPanel.viewColumn を含む）を直接呼び出すためのテスト専用シーム。
const testOpenLinkInjectors = new Map<string, (href: string) => Promise<void>>();

export async function injectWebviewChangeForTesting(uri: vscode.Uri, markdown: string): Promise<boolean> {
    const inject = testChangeInjectors.get(uri.toString());
    if (!inject) return false;
    await inject(markdown);
    return true;
}

export async function injectWebviewOpenLinkForTesting(uri: vscode.Uri, href: string): Promise<boolean> {
    const inject = testOpenLinkInjectors.get(uri.toString());
    if (!inject) return false;
    await inject(href);
    return true;
}

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
        showFocusSyntax: getConfig<boolean>('preview.showFocusSyntax', false),
        enableSlashMenu: getConfig<boolean>('preview.enableSlashMenu', true),
        showToolbar: getConfig<boolean>('preview.showToolbar', true),
        toolbarShowShortcuts: getConfig<boolean>('preview.toolbarShowShortcuts', true),
        // 既定 on（Raw の行番号との一貫性）。既定値は resolveShowLineNumbers 側に一元化する。
        showLineNumbers: resolveShowLineNumbers(vscode.workspace.getConfiguration('markdownInline')),
        language: vscode.env.language
    };
}

function buildHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
    const nonce = getNonce();
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'milkdown.bundle.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'milkdown-preview.css'));
    const hljsStyleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'hljs-github.css'));
    const katexStyleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'katex.min.css'));
    const csp = buildPreviewCsp(webview.cspSource, nonce);

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

// Raw / Preview のモードは「最後に使ったモード」を globalState に記憶する。
// この記憶は **新規に開く** Markdown ファイルの初期モードにのみ使う
// （最後に Preview なら新規も Preview、最後に Raw なら新規も Raw）。
// 既に開いているファイルには適用しない（強制切替しない）。
function rememberMode(context: vscode.ExtensionContext, mode: 'raw' | 'preview'): void {
    if (!getConfig<boolean>('preview.rememberMode', true)) return;
    void context.globalState.update(GLOBAL_MODE_KEY, mode);
}

function getRememberedMode(context: vscode.ExtensionContext): 'raw' | 'preview' | undefined {
    if (!getConfig<boolean>('preview.rememberMode', true)) return undefined;
    return context.globalState.get<'raw' | 'preview'>(GLOBAL_MODE_KEY);
}

/** 「次に新規で Markdown を開いたときのモード」。記憶モード優先、無ければ設定の既定値。 */
function currentDefaultOpenMode(context: vscode.ExtensionContext): 'raw' | 'preview' {
    return resolveDefaultOpenMode({
        remembered: getRememberedMode(context),
        defaultMode: getConfig<string>('preview.defaultMode', 'preview')
    });
}

/**
 * `.md` の既定エディタ（VS Code 本体の `workbench.editorAssociations`）を、今のモードへ
 * 追従させる。Raw モードなら標準テキストエディタが最初から解決されるため、Preview の
 * Custom Editor を生成してから跳ね返す（bounceToRawEditor）2手が不要になり、開く経路での
 * タブ2枚並存も構造的に無くなる。同じパターンに `priority: "default"` を主張する他拡張との
 * 競合も、ユーザー設定であるこの関連付けが優先されることで解消する。
 * 詳細: docs/specifications/default-editor-association-sync.md
 */
async function applyDefaultEditorAssociation(context: vscode.ExtensionContext): Promise<void> {
    const config = vscode.workspace.getConfiguration('markdownInline');
    const desired = resolveControlDefaultEditor(config) ? currentDefaultOpenMode(context) : null;
    const workbench = vscode.workspace.getConfiguration('workbench');
    const current = workbench.get<Record<string, string>>('editorAssociations');
    const next = computeEditorAssociations(current, desired);
    if (editorAssociationsEqual(current, next)) return;
    try {
        // 空になる場合は `{}` を書き残さず、設定そのものを削除する。
        const value = Object.keys(next).length === 0 ? undefined : next;
        await workbench.update('editorAssociations', value, vscode.ConfigurationTarget.Global);
        debugLog(`[preview] applied workbench.editorAssociations for mode=${desired ?? 'off'}`);
    } catch (error) {
        // 設定ファイルが書き込めない環境（読み取り専用プロファイル等）でも、跳ね返し経路で
        // 動作自体は成立するため致命的ではない。
        debugLog(`[preview] applyDefaultEditorAssociation failed, ignoring: ${String(error)}`);
    }
}

/** エディタの「現在画面最上部の行」。スクロール位置の同期基準に使う。 */
function topVisibleLine(editor: vscode.TextEditor): number {
    return editor.visibleRanges[0]?.start.line ?? editor.selection.active.line;
}

function computeScrollRatio(editor: vscode.TextEditor | undefined): number | undefined {
    if (!editor) return undefined;
    return scrollRatioFromLine(topVisibleLine(editor), editor.document.lineCount);
}

function revealRatio(editor: vscode.TextEditor, ratio: number): void {
    const targetLine = lineFromScrollRatio(ratio, editor.document.lineCount);
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
    // Git HEAD 本文のキャッシュ（差分の基準。ファイルを開いた時点で取得）
    private readonly baseBodyCache = new Map<string, string | null>();

    constructor(private readonly context: vscode.ExtensionContext) {}

    private async getBaseBody(document: vscode.TextDocument): Promise<string | null> {
        const key = document.uri.toString();
        if (this.baseBodyCache.has(key)) return this.baseBodyCache.get(key) ?? null;
        const body = document.uri.scheme === 'file' ? await getGitHeadBody(document.uri.fsPath) : null;
        this.baseBodyCache.set(key, body);
        return body;
    }

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
            void vscode.window.showWarningMessage(vscode.l10n.t('Failed to save image.'));
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

        // customEditors の priority が "default" のため、通常オープン（サイドバー等）は
        // 常にこの Custom Editor（Preview）を経由するようになった。記憶モード/既定設定が
        // "raw" を指す場合は、ここで即座に Raw エディタへ跳ね返す（このタブはまだ webview
        // の中身を何も描画していないので、そのまま dispose して閉じる）。
        // 「未確認」の URI だけを対象にする判定基準は、下の onDidChangeActiveTextEditor
        // ハンドラ（既存ファイルにはモードを強制しない）と揃えるため、モジュール
        // スコープの seenMarkdownUris を共有する。
        // 詳細: docs/specifications/fixes/preview-default-editor-fix.md
        if (!seenMarkdownUris.has(key)) {
            seenMarkdownUris.add(key);
            // `controlDefaultEditor` が有効なら、そもそも Raw モードでこの Custom Editor が
            // 解決されること自体が無い（editorAssociations が標準テキストエディタを指すため）。
            // ここへ来るのはオプトアウト時・untitled・設定反映前の過渡期に限られる。
            if (currentDefaultOpenMode(this.context) === 'raw') {
                void bounceToRawEditor(document.uri, webviewPanel);
                return;
            }
        }

        const documentDir = path.dirname(document.uri.fsPath);
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
        const localResourceRoots = [
            vscode.Uri.joinPath(this.context.extensionUri, 'media'),
            vscode.Uri.file(documentDir)
        ];
        if (workspaceFolder) localResourceRoots.push(workspaceFolder.uri);

        // schedulePush の setTimeout や getBaseBody の Promise 継続など、非同期処理の
        // 完了時点では webviewPanel が既に破棄されていることがある（別の Preview/Raw
        // 切替と競合するタイミング。sidebar-reopen-preview-duplicate-tab-fix.md と同種の
        // レース）。破棄後に webviewPanel.webview へアクセスすると同期的に例外を投げ、
        // .then() の成功コールバック内で発生するため未処理の Promise rejection になる。
        // onDidDispose で true にし、非同期継続の先頭で必ずガードする。
        let disposed = false;

        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots
        };
        webviewPanel.webview.html = buildHtml(webviewPanel.webview, this.context.extensionUri);

        let applyingRemoteEdit = false;
        // 直近に Webview 由来で文書へ書き込んだ本文。onDidChangeTextDocument は
        // applyEdit より遅れて非同期発火するため、applyingRemoteEdit（同期フラグ）だけでは
        // 自分のエコーを取りこぼす。内容ベースでも弾くことで、入力中に update が Webview へ
        // 戻って applyExternalContent が走り「フォーカスが飛ぶ／文字が重複する」のを防ぐ。
        let lastAppliedFromWebview: string | null = null;
        // 直近に host が webview へ push した本文（外部変更の push・初回表示の init を問わない）。
        // `document`（TextDocument モデル）は Preview だけを開いている場合に外部ディスク書き込みを
        // auto-reload しないことがある（既知の制約）。保存判定をモデルの陳腐化だけで defer すると、
        // webview がこの push を基準に組み立てた正当な保存要求まで永久に defer され、ユーザーが
        // 外部編集の直後に入力した内容が保存されず消えてしまう実バグがあった。
        // 詳細: docs/specifications/fixes/stale-document-model-save-defer-fix.md
        let lastPushedToWebview: string | null = null;
        let pushTimer: ReturnType<typeof setTimeout> | undefined;
        // Webview からの各 `change`（1 キー入力ごと）は、前の書き込みが完了してから
        // 次を処理する。直列化しないと、高速入力時に後続の書き込みが古いドキュメント
        // 内容を前提に差分を組み立ててしまい、ドキュメントが壊れてカーソルが飛ぶ
        // （src/preview/host/serialQueue.ts 参照）。
        const enqueueWebviewChange = createSerialQueue();
        // 積まれている（が、まだ実行されていない）書き込みが全て完了するまで待つ。
        // 空タスクを積んで、その完了を待つだけで「現時点までの全タスクの完了待ち」になる
        // （createSerialQueue の FIFO 性を利用）。
        pendingWebviewFlush.set(key, () => enqueueWebviewChange(async () => {}));

        const pushMarkdownToWebview = (markdown: string): void => {
            if (disposed) return;
            lastPushedToWebview = markdown;
            const prepared = this.prepareForWebview(markdown, document, webviewPanel.webview);
            void webviewPanel.webview.postMessage({
                type: 'update',
                markdown: prepared.body,
                frontmatter: prepared.frontmatter
            });
        };

        // 本文の取得元を遅延評価で受け取る。エディタ内編集は document.getText()、
        // 外部（AI・他ツール）のディスク編集は最新のディスク内容を読み直して反映する。
        // `null` を返した場合は push しない（自分のエコーだと判明した場合の取り消し用）。
        const schedulePush = (readMarkdown: () => string | null | Thenable<string | null>): void => {
            if (pushTimer) clearTimeout(pushTimer);
            pushTimer = setTimeout(() => {
                pushTimer = undefined;
                void Promise.resolve(readMarkdown()).then(
                    (markdown) => { if (markdown !== null) pushMarkdownToWebview(markdown); },
                    (err: unknown) => debugLog(`[preview] push failed: ${String(err)}`)
                );
            }, 100);
        };

        const readDocumentFromDisk = async (): Promise<string> => {
            const bytes = await vscode.workspace.fs.readFile(document.uri);
            return new TextDecoder('utf-8').decode(bytes);
        };

        const applyMarkdownFromWebview = async (markdown: string): Promise<void> => {
            const restored = this.restoreFromWebview(markdown, document);
            if (document.getText() === restored) return;

            // 保存直前にディスク実内容を確認する。document モデルは外部ツールによる
            // ディスク直接書き込みを自動反映しないため、webview 由来の（外部変更を
            // 知らない）内容で無条件に上書き保存すると、その割り込みを静かに消して
            // しまう。ディスクが document / 自分の直近の書き込みのどちらとも食い違う
            // なら、外部の変更が割り込んだとみなして今回は保存を見送り、その最新内容を
            // webview へ push してマージを待つ。
            // 詳細: docs/specifications/fixes/preview-external-write-race-fix.md
            if (document.uri.scheme === 'file') {
                let onDisk: string;
                try {
                    onDisk = await readDocumentFromDisk();
                } catch {
                    onDisk = document.getText();
                }
                if (resolveWebviewSaveDecision(onDisk, document.getText(), lastAppliedFromWebview, lastPushedToWebview) === 'defer') {
                    schedulePush(() => resolveExternalPush(onDisk, lastAppliedFromWebview));
                    return;
                }
            }

            lastAppliedFromWebview = restored;
            lastPushedToWebview = restored;
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

        // テスト専用シーム（このファイル冒頭の testChangeInjectors 参照）。
        testChangeInjectors.set(key, (markdown: string) => enqueueWebviewChange(() => applyMarkdownFromWebview(markdown)));
        // テスト専用シーム（このファイル冒頭の testOpenLinkInjectors 参照）。
        testOpenLinkInjectors.set(key, (href: string) => openLinkFromPreview(href, document.uri, webviewPanel.viewColumn));

        const changeSub = vscode.workspace.onDidChangeTextDocument(event => {
            if (event.document.uri.toString() !== key || applyingRemoteEdit) return;
            // applyEdit の後に遅れて届いた「自分のエコー」を内容ベースで弾く。
            // Webview には既に同じ本文があるので push する必要はない。Raw 側や外部ツールの
            // 本当の編集はこの内容と一致しないため、通常どおり Webview へ反映される。
            schedulePush(() => resolveExternalPush(document.getText(), lastAppliedFromWebview));
        });

        // 外部（AI・他ツール）が .md をディスク上で直接編集した場合、Preview だけを開いて
        // いる（Raw のテキストエディタが無い）と onDidChangeTextDocument が発火しないことが
        // あるため、ファイルウォッチャでも変更を拾って最新のディスク内容を反映する。
        //
        // `applyingRemoteEdit`（同期フラグ）だけでは自分の保存によるエコーを取りこぼす。
        // FileSystemWatcher の発火は `onDidChangeTextDocument` よりさらに不安定なタイミング
        // （OS のファイルシステムイベント経由）で遅れて届くことがあり、`applyingRemoteEdit` が
        // 既に false に戻った後に届くと素通りしてしまう。素通りすると、直近の webview 側の
        // カーソル位置（例: 表のセル内で入力を続けている途中）に対して**古い・短いディスク内容**
        // が丸ごと push され、`applyExternalContent` の「新しい文書サイズへクランプ」によって
        // カーソルが文書の末尾（体感としては「一番下」）へ飛んでしまう。詳細:
        // docs/specifications/fixes/stale-external-push-cursor-jump-fix.md
        // `changeSub` は同じ理由から既に内容ベースの比較（`lastAppliedFromWebview` との一致判定）
        // を持っていたが、`onExternalFileChange` にはこの防御が無かった。同じ比較を追加する。
        const fileWatcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(
                vscode.Uri.file(path.dirname(document.uri.fsPath)),
                path.basename(document.uri.fsPath)
            )
        );
        const onExternalFileChange = (): void => {
            if (applyingRemoteEdit) return;
            schedulePush(async () => resolveExternalPush(await readDocumentFromDisk(), lastAppliedFromWebview));
        };
        fileWatcher.onDidChange(onExternalFileChange);
        fileWatcher.onDidCreate(onExternalFileChange);

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
                const cursorAnchor = pendingOpenCursor.get(key);
                pendingOpenCursor.delete(key);
                lastPushedToWebview = document.getText();
                const prepared = this.prepareForWebview(document.getText(), document, webviewPanel.webview);
                void webviewPanel.webview.postMessage({
                    type: 'init',
                    markdown: prepared.body,
                    frontmatter: prepared.frontmatter,
                    settings: buildSettingsPayload(),
                    scrollAnchor,
                    scrollRatio,
                    cursorAnchor
                });
                // Git HEAD 本文（差分基準）は取得が非同期なので別メッセージで送る
                void this.getBaseBody(document).then((baseMarkdown) => {
                    if (disposed) return;
                    void webviewPanel.webview.postMessage({ type: 'baseMarkdown', baseMarkdown });
                });
                return;
            }
            if (message.type === 'change' && typeof message.markdown === 'string') {
                const markdown = message.markdown;
                // 保存（applyEdit/document.save）の失敗を確実に可視化する。
                // 詳細: docs/specifications/webview-save-failure-visibility.md
                void reportRejection(
                    enqueueWebviewChange(() => applyMarkdownFromWebview(markdown)),
                    (error: unknown) => {
                        debugLog(`[preview] change apply failed: ${String(error)}`);
                        void vscode.window.showErrorMessage(
                            `Markdown Inline Preview: 編集の保存に失敗しました (${String(error)})`
                        );
                    }
                );
                return;
            }
            if (message.type === 'scroll' && typeof message.ratio === 'number') {
                lastKnownScrollRatio.set(key, message.ratio);
                if (message.anchor && typeof message.anchor.slug === 'string') {
                    lastKnownScrollAnchor.set(key, message.anchor);
                }
                return;
            }
            if (message.type === 'cursor' && message.anchor && typeof message.anchor.block === 'number') {
                lastKnownCursor.set(key, message.anchor);
                return;
            }
            if (message.type === 'openLink' && typeof message.href === 'string') {
                void openLinkFromPreview(message.href, document.uri, webviewPanel.viewColumn);
                return;
            }
            if (message.type === 'insertImage' && typeof message.dataUrl === 'string') {
                void this.savePastedImage(message.dataUrl, message.name, document, documentDir, webviewPanel.webview);
                return;
            }
            if (message.type === 'exportRequest') {
                void handleExportRequest(document, this.context.extensionPath);
                return;
            }
            if (message.type === 'copyImageRequest' && typeof message.src === 'string') {
                void handleCopyImageRequest(message.src, document.uri, this.imageUriMaps, webviewPanel.webview);
                return;
            }
            if (message.type === 'copyImageFailed') {
                // WebView 側の Clipboard API 書き込みが失敗した。黙って「何も貼り付かない」
                // 状態にせず、理由まで見せる（NotAllowedError 等の切り分けができるように）。
                const reason = typeof message.reason === 'string' ? message.reason : 'unknown error';
                void vscode.window.showWarningMessage(
                    vscode.l10n.t('Failed to copy image to clipboard: {0}', reason)
                );
                return;
            }
            if (message.type === 'toggleRaw') {
                // この Preview の document は確定しているので、findPreviewUri の推測に頼らず
                // 直接その URI を Raw に戻す。複数の Preview を開いているときに別ファイルへ
                // 飛んでしまう不具合（誤ったタブを掴む）を避けるため。
                void switchToRaw(this.context, document.uri, webviewPanel.viewColumn).then(() => {
                    syncEditorContext();
                });
            }
        });

        webviewPanel.onDidDispose(() => {
            disposed = true;
            changeSub.dispose();
            fileWatcher.dispose();
            themeSub.dispose();
            configSub.dispose();
            messageSub.dispose();
            if (pushTimer) clearTimeout(pushTimer);
            pendingWebviewFlush.delete(key);
            testChangeInjectors.delete(key);
            testOpenLinkInjectors.delete(key);
            this.imageUriMaps.delete(key);
            this.frontmatterMaps.delete(key);
            this.baseBodyCache.delete(key);
            previewSettledAt.delete(key);
            syncEditorContext();
        });

        previewSettledAt.set(key, Date.now());
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
    // VS Code のタブ構造を判定に必要な最小情報へ落とし込み、選択は純粋関数に委ねる
    // （ロジックは previewTabs.ts でユニットテスト）。
    const tabs: PreviewTabInfo[] = [];
    const uriByString = new Map<string, vscode.Uri>();
    for (const group of vscode.window.tabGroups.all) {
        for (const tab of group.tabs) {
            const previewUri = isPreviewTab(tab);
            if (previewUri) uriByString.set(previewUri.toString(), previewUri);
            tabs.push({
                isActiveGroup: group.isActive,
                isActiveTab: tab.isActive,
                previewUri: previewUri?.toString()
            });
        }
    }
    const picked = pickPreviewUri(tabs);
    return picked ? uriByString.get(picked) : undefined;
}

async function openLinkFromPreview(
    href: string,
    documentUri: vscode.Uri,
    viewColumn: vscode.ViewColumn | undefined
): Promise<void> {
    const trimmed = href.trim();
    if (!trimmed) return;

    if (/^https?:/i.test(trimmed)) {
        try {
            await vscode.env.openExternal(vscode.Uri.parse(trimmed));
        } catch (error) {
            debugLog(`[preview] openExternal failed: ${String(error)}`);
            void vscode.window.showWarningMessage(`Could not open link: ${trimmed}`);
        }
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
        // viewColumn を省略すると、リンクをクリックした時点でアクティブなのが
        // Webview パネル（activeTextEditor が undefined）のため VS Code が基準列を
        // 見失い、新しいエディタグループ（サイドバー分割）を作ってしまう。リンクを
        // クリックした Preview 自身の列を明示することで、同じ列に新しいタブとして
        // 開かれるようにする。詳細: docs/specifications/fixes/preview-link-open-same-column-fix.md
        await vscode.window.showTextDocument(targetUri, { preview: false, viewColumn });
    } catch {
        vscode.window.showWarningMessage(`Could not open link: ${trimmed}`);
    }
}

/**
 * Preview ツールバーの Export ボタンからの要求を処理する。
 *
 * `markdownInline.export.mode` 設定で動作を切り替える:
 *   "local"  → Chrome / Edge ヘッドレスでローカル PDF 生成（localExport.ts）
 *   "server" → 将来の Pro API（現状はアップグレード導線のみ）
 */
async function handleExportRequest(
    document: vscode.TextDocument,
    extensionPath: string
): Promise<void> {
    const mode = vscode.workspace
        .getConfiguration('markdownInline')
        .get<string>('export.mode', 'local');

    if (mode === 'local') {
        try {
            await exportToPdfLocal(document, extensionPath);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            void vscode.window.showErrorMessage(
                vscode.l10n.t('PDF export failed: {0}', msg)
            );
        }
        return;
    }

    // server モード（将来の Pro API）
    const upgrade = vscode.l10n.t('Upgrade to Pro');
    const later = vscode.l10n.t('Later');
    const choice = await vscode.window.showInformationMessage(
        vscode.l10n.t(
            'Server-based PDF / Marp export is a Markdown Inline Preview Pro feature. ' +
            'Switch markdownInline.export.mode to "local" to use your local Chrome browser instead.'
        ),
        upgrade,
        later
    );
    if (choice === upgrade) {
        try {
            await vscode.env.openExternal(
                vscode.Uri.parse('https://github.com/kkaiki/markdown-inline-preview#pro')
            );
        } catch (error) {
            debugLog(`[preview] openExternal failed: ${String(error)}`);
        }
    }
}

/**
 * Preview 内の画像を実体データとしてクリップボードにコピーする要求を処理する。
 *
 * WebView の CSP が fetch を禁止しているため、ファイル読み取りは Extension Host 側で行い、
 * base64 エンコードした data URL を WebView に返す。WebView 側がそれを Clipboard API に渡す。
 *
 * @param src  Milkdown 画像ノードの src 属性（vscode-webview-resource:// URI）
 * @param docUri  現在の TextDocument の URI（uriMap の参照キー）
 * @param imageUriMaps  URI マップのコレクション（webviewUri → 相対パス の逆引き）
 * @param webview  返信先 WebView
 */
async function handleCopyImageRequest(
    src: string,
    docUri: vscode.Uri,
    imageUriMaps: Map<string, Map<string, string>>,
    webview: vscode.Webview
): Promise<void> {
    const key = docUri.toString();
    const uriMap = imageUriMaps.get(key);
    const originalRelPath = uriMap?.get(src);

    if (!originalRelPath) {
        // uriMap に無い場合（例: 外部 URL、または data: URL が誤って届いた場合）は失敗として返す
        void webview.postMessage({ type: 'imageCopied', dataUrl: null });
        void vscode.window.showWarningMessage(
            vscode.l10n.t('Could not copy this image: its source is not a local file in this document.')
        );
        return;
    }

    const docDir = path.dirname(docUri.fsPath);
    const absPath = path.resolve(docDir, originalRelPath);

    try {
        const buf = await fs.promises.readFile(absPath);
        const ext = path.extname(absPath).toLowerCase().slice(1);
        const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
                   : ext === 'gif'  ? 'image/gif'
                   : ext === 'webp' ? 'image/webp'
                   : ext === 'svg'  ? 'image/svg+xml'
                   : 'image/png';
        const dataUrl = `data:${mime};base64,${buf.toString('base64')}`;
        void webview.postMessage({ type: 'imageCopied', dataUrl });
    } catch (error) {
        void webview.postMessage({ type: 'imageCopied', dataUrl: null });
        const reason = error instanceof Error ? error.message : String(error);
        void vscode.window.showWarningMessage(
            vscode.l10n.t('Failed to read the image file for copying: {0}', reason)
        );
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

    updateModeStatusBar(isMarkdown, previewUri !== undefined);
}

// ステータスバーのトグルを現在のモードに合わせて更新する。Markdown 以外を
// 開いているときは隠す。クリックで Preview ⇔ Raw を切り替える。
function updateModeStatusBar(isMarkdown: boolean, previewActive: boolean): void {
    if (!modeStatusBarItem) return;
    if (!isMarkdown) {
        modeStatusBarItem.hide();
        return;
    }
    if (previewActive) {
        modeStatusBarItem.text = '$(book) Preview';
        modeStatusBarItem.tooltip = vscode.l10n.t('Markdown Inline Preview: click to switch to Raw (Markdown source)');
    } else {
        modeStatusBarItem.text = '$(markdown) Raw';
        modeStatusBarItem.tooltip = vscode.l10n.t('Markdown Inline Preview: click to switch to Preview (WYSIWYG)');
    }
    modeStatusBarItem.show();
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
    try {
        await vscode.window.tabGroups.close(tabs, true);
    } catch {
        // openWith may have already replaced/closed the tab in-place, leaving a
        // stale handle. VS Code then throws "Invalid tab not found!" — ignore it.
    }
}

/**
 * `PreviewEditorProvider.resolveCustomTextEditor` から、記憶モード/既定設定が "raw" の
 * 場合に呼ばれる。まだ何も描画していない Preview のタブを、同じ位置の Raw（既定の
 * テキストエディタ）へ置き換える。
 *
 * **webviewPanel を自分で dispose してはいけない**。エディタ解決（resolveCustomTextEditor）の
 * 最中に panel を破棄すると、VS Code はそのオープン操作自体を失敗扱いにし、
 * `Unable to open 'xxx.md' / OverlayWebview has been disposed` というダイアログを出して
 * タブを壊れたまま残す（2026-07-26 ユーザー報告）。代わりに解決を正常に終えてから
 * `vscode.openWith(uri, 'default')` でタブを置き換え、panel の破棄は VS Code に任せる。
 *
 * `rememberMode` は呼ばない — ここは「既に raw が選ばれている」ことを尊重して跳ね返す
 * だけであり、ユーザーが今まさに raw へ切り替えたわけではないため、記憶を上書きする
 * 必要が無い（switchToRaw と異なる点）。
 */
async function bounceToRawEditor(uri: vscode.Uri, webviewPanel: vscode.WebviewPanel): Promise<void> {
    const viewColumn = webviewPanel.viewColumn;
    // resolveCustomTextEditor から抜けて、VS Code 側のエディタ解決が完了するのを待つ。
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    try {
        await vscode.commands.executeCommand('vscode.openWith', uri, 'default', viewColumn);
        // 保存済みファイルでは openWith がタブを in-place 置換するため、ここで残る Preview
        // タブは通常存在しない（untitled 等、置換されなかった場合だけ後片付けする）。
        await closeStaleTabs(findTabs(isPreviewTabForUri(uri)));
    } catch {
        // パネルが既に破棄されている等、跳ね返し中の競合は致命的ではないので無視する。
        debugLog('[preview] bounceToRawEditor failed, ignoring');
    }
}

async function switchToPreview(
    context: vscode.ExtensionContext,
    document: vscode.TextDocument,
    viewColumn: vscode.ViewColumn | undefined,
    editor?: vscode.TextEditor
): Promise<void> {
    const key = document.uri.toString();
    // 未保存（dirty）のまま Preview へ切り替えると、テキストタブの差し替え／クローズの
    // 過程で VS Code がモデルをディスク内容へリバートし、編集が丸ごと失われる。
    // Preview モードは 1 キー入力ごとに保存する自動保存前提の設計なので、切替前にも
    // 同じ思想で保存してから差し替える。untitled はディスク実体が無く（リバートによる
    // 消失も起きない）、save() が「名前を付けて保存」ダイアログを開いてしまうため除外。
    // 詳細: docs/specifications/fixes/dirty-raw-edit-preview-switch-loss-fix.md
    if (document.isDirty && !document.isUntitled) {
        await document.save();
    }
    if (editor) {
        // カーソル位置を引き継ぐ（同じ場所で編集を続けられるように）。
        const pos = editor.selection.active;
        pendingOpenCursor.set(key, rawToCursorAnchor(document.getText(), pos.line, pos.character));
    }
    if (getConfig<boolean>('preview.syncScroll', true) && editor) {
        // カーソル行ではなく「画面最上部の行」を基準にする。マウスホイールでスクロール
        // しただけ（カーソルは動かない）でも Preview が同じ位置で開くようにするため。
        const topLine = topVisibleLine(editor);
        const anchor = findScrollAnchor(document, topLine);
        if (anchor) {
            pendingOpenScrollAnchor.set(key, anchor);
        }
        // アンカー見出しが Preview 側で見つからない場合の保険として、比率も常に渡す。
        pendingOpenScrollRatio.set(key, computeScrollRatio(editor) ?? 0);
    }
    rememberMode(context, 'preview');
    void applyDefaultEditorAssociation(context);
    inFlightSwitch.add(key);
    try {
        await vscode.commands.executeCommand('vscode.openWith', document.uri, VIEW_TYPE, viewColumn);
        // Re-query after openWith: it may have replaced the text tab in-place, which
        // would make a pre-captured handle stale and throw on close.
        //
        // untitled ドキュメントでは vscode.openWith がテキストタブを Custom Editor へ
        // 置き換えず、同じ URI のタブが2枚（テキスト+Custom Editor）並存する。この状態で
        // 古いテキストタブを閉じると、ディスク実体を持たない untitled の TextDocument の
        // 内容がその場で失われる（VS Code 側の挙動、実 VS Code で確認済み）。
        // 詳細: docs/specifications/fixes/untitled-preview-content-loss-fix.md
        const untitledTextBeforeClose =
            document.uri.scheme === 'untitled' ? document.getText() : null;
        await closeStaleTabs(findTabs(isTextTabForUri(document.uri)));
        if (untitledTextBeforeClose !== null && untitledTextBeforeClose.length > 0
            && document.getText() === '') {
            const edit = new vscode.WorkspaceEdit();
            edit.insert(document.uri, new vscode.Position(0, 0), untitledTextBeforeClose);
            await vscode.workspace.applyEdit(edit);
        }
    } catch (error) {
        debugLog(`[preview] switchToPreview failed: ${String(error)}`);
        void vscode.window.showErrorMessage(
            `Markdown Inline Preview: Preview への切り替えに失敗しました (${String(error)})`
        );
    } finally {
        inFlightSwitch.delete(key);
    }
}

async function switchToRaw(
    context: vscode.ExtensionContext,
    uri: vscode.Uri,
    viewColumn: vscode.ViewColumn | undefined
): Promise<void> {
    const key = uri.toString();
    // webview 由来の直近の編集がまだ書き込みキューに残っていれば、Preview を破棄する前に
    // 完了させる。これを待たずに openWith すると、直前の編集（タイプ直後にすぐ Raw へ
    // 切り替えた場合など）が Raw 側に反映されないまま失われることがある。
    await pendingWebviewFlush.get(key)?.();
    const anchor = lastKnownScrollAnchor.get(key);
    const ratio = lastKnownScrollRatio.get(key);
    const cursor = lastKnownCursor.get(key);
    rememberMode(context, 'raw');
    void applyDefaultEditorAssociation(context);
    inFlightSwitch.add(key);
    let editor: vscode.TextEditor;
    try {
        await vscode.commands.executeCommand('vscode.openWith', uri, 'default', viewColumn);

        // 古い Preview タブを閉じる前に、対象ファイルの Raw エディタへ明示的にフォーカスを固定する。
        // openWith 後もまだ古い Preview タブが「アクティブ」のままだと、後続の closeStaleTabs が
        // それ（＝アクティブなタブ）を閉じることになり、VS Code の既定動作（閉じたタブの隣を
        // 自動選択）が発動して、複数ファイルを Preview 中に切替えた別ファイルへフォーカスが
        // 漂流することがある。先にフォーカスを移しておけば、閉じるのは非アクティブなタブに
        // なるため、この自動選択は発生しない。
        const doc = await vscode.workspace.openTextDocument(uri);
        editor = await vscode.window.showTextDocument(doc, { viewColumn, preserveFocus: false });

        // Re-query after openWith (see switchToPreview): avoids closing a stale handle.
        await closeStaleTabs(findTabs(isPreviewTabForUri(uri)));
    } catch (error) {
        // ここでの失敗は「切替そのもの」が成立していない（Raw タブが開けていない等）ため、
        // ユーザーに見せる価値がある。
        debugLog(`[preview] switchToRaw failed: ${String(error)}`);
        void vscode.window.showErrorMessage(
            `Markdown Inline Preview: Raw への切り替えに失敗しました (${String(error)})`
        );
        inFlightSwitch.delete(key);
        return;
    }
    inFlightSwitch.delete(key);

    // ここから先はカーソル/スクロール位置の復元のみ（切替自体は上で既に成功している）。
    // これらは体感を良くするための付随処理であり、失敗しても「切替が失敗した」わけではない。
    // 全体を1つの catch にまとめてしまうと、ここだけの失敗（例: 保存済みアンカーが古い内容と
    // ズレて解決できない）でも毎回「切替に失敗しました」という誤解を招くエラーダイアログが出て
    // しまう（実際に高頻度の切替操作でこの種の失敗が起きうることをユーザー報告で確認）。
    // そのためログのみに留め、ユーザーには通知しない。
    try {
        // カーソル位置の引き継ぎ（Preview → Raw）。同じ場所で編集を続けられるように、
        // カーソルを置いてその行を見せる（スクロール同期より優先）。
        if (cursor) {
            const { line, character } = cursorAnchorToRaw(editor.document.getText(), cursor);
            const safeLine = Math.min(Math.max(line, 0), editor.document.lineCount - 1);
            const safeCol = Math.min(Math.max(character, 0), editor.document.lineAt(safeLine).text.length);
            const p = new vscode.Position(safeLine, safeCol);
            editor.selection = new vscode.Selection(p, p);
            editor.revealRange(new vscode.Range(p, p), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
            return;
        }

        if (!getConfig<boolean>('preview.syncScroll', true)) return;
        if (anchor) {
            revealAnchor(editor, anchor);
            return;
        }
        if (ratio !== undefined) {
            revealRatio(editor, ratio);
        }
    } catch (error) {
        debugLog(`[preview] switchToRaw cursor/scroll restore failed: ${String(error)}`);
    }
}

// 「既に Preview で開いているファイルが、同じエディタグループに Raw タブとして
// 再度開かれた」状態を検知し、その Raw タブを閉じて Preview 側だけを残す。
// customEditor が priority: "option" のため、サイドバー（Explorer）から既に
// Preview 中のファイルを再度開くと既定の Raw エディタが同じグループに追加されて
// しまう不具合の対策。詳細: docs/specifications/fixes/sidebar-reopen-preview-duplicate-tab-fix.md
//
// `vscode.window.onDidChangeActiveTextEditor`（Raw エディタがアクティブになった
// 瞬間）だけをトリガーにする。すべてのタブ変更（`tabGroups.onDidChangeTabs`）を
// 対象にすると、モード記憶機能が新規ファイルを自動で Preview 化する処理や、
// それを打ち消すテストヘルパーの openWith 呼び出しなど、無関係な Raw⇄Preview の
// 過渡状態にまで反応してしまい、他の切替処理と競合する（実際に dirty な文書の
// Raw→Preview→Raw 往復テストで "Illegal argument: TextEditor" という回帰が
// 発生した）。「Raw エディタがアクティブになった」というイベントに絞ることで、
// 対象を実際にユーザー操作（や外部からの再オープン）で新しい Raw タブが表に
// 出てきた瞬間だけに限定できる。
//
// グループ単位でしか閉じないため、別のエディタグループ（例: 右側）に明示的に
// 開いた Raw タブは対象外＝意図的な「左 Preview・右 Raw」の 2 画面構成は崩さない。
// inFlightSwitch に登録中の URI は、switchToPreview/switchToRaw が意図的に
// 切替中（Preview タブと Raw タブが一時的に並存する）なので対象から除外する
// （自分自身のタブ後始末と競合させないため）。
async function collapseDuplicateRawTabsInGroup(uri: vscode.Uri, group: vscode.TabGroup): Promise<void> {
    const key = uri.toString();
    if (inFlightSwitch.has(key)) return;

    const hasPreviewTab = group.tabs.some(tab => isPreviewTab(tab)?.toString() === key);
    if (!hasPreviewTab) return;

    // Preview タブが最近（モード記憶による自動切替などで）作られたばかりの場合は
    // 対象外にする。安定して開いている Preview に対してだけ、サイドバー等からの
    // 再オープンによる重複を解消する。
    const settledAt = previewSettledAt.get(key);
    if (settledAt === undefined || Date.now() - settledAt < DUPLICATE_COLLAPSE_SETTLE_MS) return;

    const staleRawTabs = group.tabs.filter(tab =>
        tab.input instanceof vscode.TabInputText && tab.input.uri.toString() === key
    );
    if (staleRawTabs.length === 0) return;

    try {
        // 閉じる前に Preview タブを「そのグループのアクティブなタブ」に確定させる
        // （アクティブなタブを先に閉じると VS Code の自動選択で無関係なタブへ飛ぶ
        // ことがあるため）。`preserveFocus: true` はこの「アクティブタブにする」効果は
        // 保ったまま、キーボードフォーカスまでは奪わない（サイドバー等、この重複解消が
        // 走った時点でフォーカスがあった場所を尊重する）。
        await vscode.commands.executeCommand('vscode.openWith', uri, VIEW_TYPE, {
            viewColumn: group.viewColumn,
            preserveFocus: true
        });
        await closeStaleTabs(staleRawTabs);
    } catch {
        // 対象ファイルが別の非同期処理（テストの後始末等）で既に閉じられた／
        // 削除された直後に発火することがある。重複解消は「できれば直す」補助的な
        // 処理であり、失敗しても致命的ではないので closeStaleTabs 同様に例外は
        // 無視する（未処理の Promise rejection として無関係なタイミングで
        // 表面化するのを防ぐため）。
        debugLog('[preview] collapseDuplicateRawTabsInGroup failed, ignoring');
    }
}

async function collapseDuplicateRawTabForActiveEditor(editor: vscode.TextEditor): Promise<void> {
    const group = vscode.window.tabGroups.all.find(g => g.viewColumn === editor.viewColumn);
    if (!group) return;
    await collapseDuplicateRawTabsInGroup(editor.document.uri, group);
}

export function activatePreviewFeature(context: vscode.ExtensionContext): void {
    const provider = new PreviewEditorProvider(context);

    // 常時表示のモードトグル（タイトルバーが折りたたまれても見える保険）。
    modeStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    modeStatusBarItem.command = 'markdownInline.togglePreview';
    context.subscriptions.push(modeStatusBarItem);

    syncEditorContext();

    // 起動時点で、前回終了時のモードが `.md` の既定エディタへ反映済みであることを保証する
    // （設定を手で戻された場合や、この機能の導入直後の初回起動を含む）。
    void applyDefaultEditorAssociation(context);

    // テスト専用コマンド（このファイル冒頭の testChangeInjectors 参照）。
    // `@vscode/test-electron` 実行時のみ `context.extensionMode` が `Test` になるため、
    // 通常のユーザーインストールでは絶対に登録されない。
    if (context.extensionMode === vscode.ExtensionMode.Test) {
        context.subscriptions.push(
            vscode.commands.registerCommand(
                'markdownInline.__test.injectWebviewChange',
                (uriString: string, markdown: string) => injectWebviewChangeForTesting(vscode.Uri.parse(uriString), markdown)
            ),
            vscode.commands.registerCommand(
                'markdownInline.__test.injectOpenLink',
                (uriString: string, href: string) => injectWebviewOpenLinkForTesting(vscode.Uri.parse(uriString), href)
            )
        );
    }

    // 拡張機能の起動時点で既に開いていたタブを「既存ファイル」として記録する
    // （モジュールスコープの seenMarkdownUris の初期値。宣言側のコメント参照）。
    for (const group of vscode.window.tabGroups.all) {
        for (const tab of group.tabs) {
            const input = tab.input;
            if (input instanceof vscode.TabInputText && isMarkdownResource(input.uri)) {
                seenMarkdownUris.add(input.uri.toString());
            } else if (input instanceof vscode.TabInputCustom && input.viewType === VIEW_TYPE) {
                seenMarkdownUris.add(input.uri.toString());
            }
        }
    }

    context.subscriptions.push(
        vscode.window.registerCustomEditorProvider(VIEW_TYPE, provider, {
            webviewOptions: { retainContextWhenHidden: true },
            supportsMultipleEditorsPerDocument: false
        }),

        // `collapseDuplicateRawTabForActiveEditor`（onDidChangeActiveTextEditor 起点）は、
        // 新しく出てきた Raw タブが一度も「アクティブ」にならない場合（例: サイドバー等からの
        // 再オープンと同時に別の操作でフォーカスが Preview 側へ戻る）には発火しない取りこぼしが
        // あった。ここでは `event.opened`（新規に作られたタブだけ）に限定して同じ重複解消を
        // 試みることで、そのケースを補う。`opened` だけを見るのは、あらゆるタブ変更
        // （アクティブ化・並べ替え・close 等）に反応すると無関係な Raw⇄Preview の過渡状態と
        // 競合し "Illegal argument: TextEditor" を誘発した過去の経緯があるため
        // （sidebar-reopen-preview-duplicate-tab-fix.md §「トリガーを...にすると」参照）。
        // 「新規タブの出現」だけに絞ることで、既存タブの活性化・並べ替えには一切反応しない。
        vscode.window.tabGroups.onDidChangeTabs(event => {
            for (const tab of event.opened) {
                if (!(tab.input instanceof vscode.TabInputText)) continue;
                if (!isMarkdownResource(tab.input.uri)) continue;
                void collapseDuplicateRawTabsInGroup(tab.input.uri, tab.group);
            }
        }),

        vscode.window.onDidChangeActiveTextEditor(() => {
            syncEditorContext();
        }),

        vscode.window.onDidChangeActiveColorTheme(() => {
            syncEditorContext();
        }),

        vscode.commands.registerCommand('markdownInline.openPreview', async () => {
            // 「今アクティブな Raw Markdown エディタを Preview にする」動作。他ファイルの
            // Preview が別グループに既に開いていても、それに引きずられて何もしない、という
            // ことがあってはならない（switchToPreview は document.uri を直接指定するため、
            // 他ファイルの Preview 状態を気にする必要が無い。togglePreview の toPreview
            // 分岐と同じ判断基準に揃える）。
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

        vscode.commands.registerCommand('markdownInline.toggleLineNumbers', async () => {
            // 設定 UI をキー ID で検索するより、コマンドパレットから一発で切り替えたい
            // という要望に応えるための専用トグル。effective value（既定込み）を反転して
            // 書き戻す。アクティブなエディタの有無やモードには依存しない。
            const config = vscode.workspace.getConfiguration('markdownInline');
            const next = !resolveShowLineNumbers(config);
            await config.update('preview.showLineNumbers', next, vscode.ConfigurationTarget.Global);
        }),

        vscode.commands.registerCommand('markdownInline.repairNestedCodeFences', async () => {
            // コードブロックの中へフェンス付きテキストを貼ると内容にフェンスが入り込み、
            // 保存時に外側が4連へ広がって「二重フェンス」になる（nested-code-fence-repair.md）。
            // 貼り付け側は防止済みだが、既に壊れたファイルを直す手段としてこのコマンドを持つ。
            const editor = vscode.window.activeTextEditor;
            const uri = editor?.document.languageId === 'markdown'
                ? editor.document.uri
                : findPreviewUri();
            if (!uri) {
                void vscode.window.showWarningMessage(
                    vscode.l10n.t('Open a Markdown file first.')
                );
                return;
            }

            const doc = await vscode.workspace.openTextDocument(uri);
            const original = doc.getText();
            const { markdown, fixed } = repairNestedCodeFences(original);
            if (fixed === 0) {
                void vscode.window.showInformationMessage(
                    vscode.l10n.t('No double-fenced code blocks found in this file.')
                );
                return;
            }

            const edit = new vscode.WorkspaceEdit();
            edit.replace(
                uri,
                new vscode.Range(doc.positionAt(0), doc.positionAt(original.length)),
                markdown
            );
            await vscode.workspace.applyEdit(edit);
            void vscode.window.showInformationMessage(
                vscode.l10n.t('Repaired {0} double-fenced code block(s).', fixed)
            );
        }),

        vscode.commands.registerCommand('markdownInline.togglePreview', async () => {
            const editor = vscode.window.activeTextEditor;
            const isRawMarkdown = !!editor && editor.document.languageId === 'markdown';
            const action = decidePreviewToggle({
                activeEditorIsRawMarkdown: isRawMarkdown,
                activeMarkdownUri: isRawMarkdown ? editor.document.uri.toString() : undefined,
                resolvedPreviewUri: findPreviewUri()?.toString()
            });
            if (action.kind === 'toPreview' && editor) {
                await switchToPreview(context, editor.document, editor.viewColumn, editor);
                syncEditorContext();
            } else if (action.kind === 'toRaw') {
                await switchToRaw(context, vscode.Uri.parse(action.uri), vscode.ViewColumn.Active);
                syncEditorContext();
            }
        }),

        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (!editor || editor.document.languageId !== 'markdown') return;
            const key = editor.document.uri.toString();
            // 既存（このセッションで既に開いていた）ファイルにはモードを強制しない。
            // 初めて見る URI＝新規オープンのときだけ、記憶した最後のモードを適用する。
            if (seenMarkdownUris.has(key)) {
                // 既存ファイルが Raw エディタとしてアクティブになった場合、同じ
                // グループに既に Preview タブが開いていれば重複とみなして解消する
                // （サイドバーからの再オープンなどで発生する）。
                void collapseDuplicateRawTabForActiveEditor(editor);
                return;
            }
            seenMarkdownUris.add(key);
            if (currentDefaultOpenMode(context) === 'preview') {
                void switchToPreview(context, editor.document, editor.viewColumn, editor);
            }
        }),

        // 既定エディタの関連付けは「次に開くファイルのモード」を表すため、モード判定に
        // 関わる設定が変わったら書き直す（オプトアウト時は自分が書いた関連付けを撤去する）。
        vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration('markdownInline.preview.controlDefaultEditor')
                || event.affectsConfiguration('markdownInline.preview.defaultMode')
                || event.affectsConfiguration('markdownInline.preview.rememberMode')) {
                void applyDefaultEditorAssociation(context);
            }
        })
    );
}
