/**
 * ローカル PDF エクスポート（local モード）。
 *
 * ユーザーの Chrome / Edge / Chromium をヘッドレスで起動し、
 * Markdown を HTML に変換した一時ファイルを --print-to-pdf で PDF 化する。
 * **文書の内容はサーバーへ一切送らない**（オフラインでも動作する）。
 *
 * HTML の組み立ては `src/shared/pdfHtml.ts`（VS Code 非依存・ユニットテスト対象）。
 * クレジット行を入れるかどうかは呼び出し側が `options.credit` で決める。
 *
 * エクスポートモードは `markdownInline.export.mode` 設定で切り替え可能:
 *   "local"  → このファイルの処理（Chrome ヘッドレス）
 *   "server" → 将来の Pro API
 *
 * Live / Preview の両モードから使う。`src/shared/` は VS Code API 非依存の規約なので
 * host 層（`src/live/host/`）に置いている。
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { splitFrontmatter } from '../../shared/markdown/frontmatter';
import { buildPdfHtml } from '../../shared/pdfHtml';
import { DEFAULT_PDF_STYLING, type PdfStyling } from '../../shared/pdfStyling';

const execFileAsync = promisify(execFile);

/** OS 別の Chrome / Edge / Chromium 候補パス一覧。 */
function browserCandidates(): string[] {
    if (process.platform === 'darwin') {
        return [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
            '/Applications/Chromium.app/Contents/MacOS/Chromium',
            '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
        ];
    }
    if (process.platform === 'win32') {
        const pf   = process.env['PROGRAMFILES']         ?? 'C:\\Program Files';
        const pf86 = process.env['PROGRAMFILES(X86)']   ?? 'C:\\Program Files (x86)';
        const lad  = process.env['LOCALAPPDATA']         ?? '';
        return [
            path.join(pf,   'Google', 'Chrome',    'Application', 'chrome.exe'),
            path.join(pf86, 'Google', 'Chrome',    'Application', 'chrome.exe'),
            path.join(lad,  'Google', 'Chrome',    'Application', 'chrome.exe'),
            path.join(pf,   'Microsoft', 'Edge',   'Application', 'msedge.exe'),
            path.join(pf86, 'Microsoft', 'Edge',   'Application', 'msedge.exe'),
        ];
    }
    // Linux / その他
    return [
        '/usr/bin/google-chrome-stable',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
        '/usr/bin/microsoft-edge',
    ];
}

/** 実行可能なブラウザのパスを返す。見つからなければ undefined。 */
function findBrowser(): string | undefined {
    const customPath = vscode.workspace
        .getConfiguration('markdownInline')
        .get<string>('export.browserPath', '')
        .trim();

    const candidates = customPath
        ? [customPath, ...browserCandidates()]
        : browserCandidates();

    return candidates.find((c) => {
        try {
            fs.accessSync(c, fs.constants.X_OK);
            return true;
        } catch {
            return false;
        }
    });
}

export interface LocalExportOptions {
    /**
     * 全ページ下部にクレジット行を入れるか（無料版）。
     * 判定は `src/shared/license/entitlement.ts` の `shouldIncludeCredit()` が行う。
     */
    credit: boolean;
    /** PDF の体裁（PRO+）。使えるかどうかは呼び出し側が判定済みのものを渡す */
    styling?: PdfStyling;
}

/** 書き出した日（ローカル時刻の YYYY-MM-DD）。ヘッダー・フッターの {date} に入る。 */
function today(): string {
    const d = new Date();
    const pad = (n: number): string => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * ローカル Chrome ヘッドレスで PDF を生成してファイルに保存する。
 * @param document エクスポート対象の TextDocument
 * @param extensionPath 拡張機能のルートディレクトリ（media/ の親）
 * @param options クレジット行の有無
 */
export async function exportToPdfLocal(
    document: vscode.TextDocument,
    extensionPath: string,
    options: LocalExportOptions
): Promise<void> {
    if (document.uri.scheme !== 'file') {
        throw new Error(vscode.l10n.t(
            'PDF export requires a saved file. Please save the document first.'
        ));
    }

    // frontmatter を除いた本文を変換
    const { body } = splitFrontmatter(document.getText());

    // PDF 用 CSS を読み込む
    const cssPath = path.join(extensionPath, 'media', 'pdf-export.css');
    let css = '';
    try { css = fs.readFileSync(cssPath, 'utf-8'); } catch { /* fallback: no css */ }

    const html = buildPdfHtml(body, css, {
        credit: options.credit,
        styling: options.styling ?? DEFAULT_PDF_STYLING,
        context: {
            title: path.basename(document.uri.fsPath).replace(/\.(md|markdown)$/i, ''),
            date: today(),
            tocTitle: vscode.l10n.t('Contents')
        }
    });

    // 一時 HTML をドキュメントと同ディレクトリに置く
    // → relative な画像パス（./image.png 等）が正しく解決される
    const docDir = path.dirname(document.uri.fsPath);
    const tmpName = `.ipreview-pdf-${Date.now()}.html`;
    const tmpHtml = path.join(docDir, tmpName);

    const outputPdf = document.uri.fsPath.replace(/\.(md|markdown)$/i, '') + '.pdf';

    const browser = findBrowser();
    if (!browser) {
        throw new Error(vscode.l10n.t(
            'No Chromium-based browser found (Chrome / Edge / Chromium). ' +
            'Install one or set markdownInline.export.browserPath.'
        ));
    }

    try {
        fs.writeFileSync(tmpHtml, html, 'utf-8');

        await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: 'Exporting PDF…', cancellable: false },
            () => execFileAsync(browser, [
                '--headless=new',
                '--disable-gpu',
                '--no-pdf-header-footer',
                `--print-to-pdf=${outputPdf}`,
                `file://${tmpHtml}`,
            ], { timeout: 30_000 })
        );
    } finally {
        try { fs.unlinkSync(tmpHtml); } catch { /* ignore */ }
    }

    const openLabel = vscode.l10n.t('Open');
    const choice = await vscode.window.showInformationMessage(
        vscode.l10n.t('PDF saved: {0}', path.basename(outputPdf)),
        openLabel
    );
    if (choice === openLabel) {
        await vscode.env.openExternal(vscode.Uri.file(outputPdf));
    }
}
