/**
 * ローカル PDF エクスポート（local モード）。
 *
 * ユーザーの Chrome / Edge / Chromium をヘッドレスで起動し、
 * Markdown を HTML に変換した一時ファイルを DevTools プロトコルで印刷して PDF 化する（`chromePdf.ts`）。
 * 数式・Mermaid・コードの色分けは印刷する Chrome の中で描き、描き終えてから印刷する
 * （docs/specifications/fixes/pdf-output-parity-fix.md）。
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
import { pathToFileURL } from 'url';
import { splitFrontmatter } from '../../shared/markdown/frontmatter';
import { buildPdfHtml, type PdfAssets } from '../../shared/pdfHtml';
import { DEFAULT_PDF_STYLING, type PdfStyling } from '../../shared/pdfStyling';
import { launchChromePdf } from './chromePdf';

/** 印刷する Chrome に読み込ませる描画部品（拡張に同梱。scripts/build-lazy-bundles.mjs が out/ に作る） */
export function pdfAssets(extensionPath: string): PdfAssets {
    const url = (...parts: string[]) => pathToFileURL(path.join(extensionPath, ...parts)).href;
    return {
        runtimeScript: url('out', 'pdfRuntime.js'),
        katexCss: url('media', 'katex.min.css'),
        mermaidScript: url('out', 'mermaid.min.js')
    };
}

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
export function findBrowser(): string | undefined {
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
export function today(): string {
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
        assets: pdfAssets(extensionPath),
        styling: options.styling ?? DEFAULT_PDF_STYLING,
        context: {
            title: path.basename(document.uri.fsPath).replace(/\.(md|markdown)$/i, ''),
            date: today(),
            tocTitle: vscode.l10n.t('Contents')
        }
    });

    const outputPdf = document.uri.fsPath.replace(/\.(md|markdown)$/i, '') + '.pdf';
    await printHtmlToPdf(html, document.uri.fsPath, outputPdf, vscode.l10n.t('Exporting PDF…'));
    void offerToOpen(outputPdf, vscode.l10n.t('PDF saved: {0}', path.basename(outputPdf)));
}

/**
 * HTML をローカル Chrome ヘッドレスで PDF にする（PDF 書き出しと Marp スライド書き出しで共用）。
 * 一時 HTML は元の .md と同じフォルダに置く（相対パスの画像を解決するため）。終わったら消す。
 *
 * 以前は `--print-to-pdf`（CLI）で印刷していたが、描画スクリプトの完了を待てず、ときどき Chrome が
 * 終了コード 2 で落ちていたので、まとめて書き出しと同じ DevTools プロトコルの印刷に寄せた（2026-09-29）。
 */
export async function printHtmlToPdf(
    html: string,
    sourcePath: string,
    outputPdf: string,
    progressTitle: string,
    timeoutMs = 60_000
): Promise<void> {
    const browser = findBrowser();
    if (!browser) {
        throw new Error(vscode.l10n.t(
            'No Chromium-based browser found (Chrome / Edge / Chromium). ' +
            'Install one or set markdownInline.export.browserPath.'
        ));
    }

    const tmpHtml = path.join(path.dirname(sourcePath), `.ipreview-pdf-${Date.now()}.html`);
    try {
        fs.writeFileSync(tmpHtml, html, 'utf-8');
        await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: progressTitle, cancellable: false },
            async () => {
                const session = await launchChromePdf(browser);
                try {
                    await session.print(tmpHtml, outputPdf, { timeoutMs });
                } finally {
                    await session.close();
                }
            }
        );
    } finally {
        try { fs.unlinkSync(tmpHtml); } catch { /* ignore */ }
    }
}

/** 書き出し完了の通知に「開く」を添える。押されるまで待たないよう、呼び出し側は await しない。 */
export async function offerToOpen(outputPdf: string, message: string): Promise<void> {
    const openLabel = vscode.l10n.t('Open');
    const choice = await vscode.window.showInformationMessage(message, openLabel);
    if (choice === openLabel) {
        await vscode.env.openExternal(vscode.Uri.file(outputPdf));
    }
}
