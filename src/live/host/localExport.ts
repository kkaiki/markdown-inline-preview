/**
 * ローカル PDF エクスポート（local モード）。
 *
 * ユーザーの Chrome / Edge / Chromium をヘッドレスで起動し、
 * Markdown を HTML に変換した一時ファイルを --print-to-pdf で PDF 化する。
 * サーバーへの送信・Pro ライセンス不要でオフラインでも動作する。
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
import { marked } from 'marked';
import { splitFrontmatter } from '../../shared/markdown/frontmatter';

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

/**
 * タスクリストアイテムのテキストノードを <span class="task-label"> で囲む。
 * marked は <li><input ...> text</li> と出力するが、テキストノードは CSS で
 * 直接選択できないため、取り消し線などのスタイルを当てるためにラップする。
 */
function wrapTaskLabels(html: string): string {
    return html.replace(
        /(<li>)(<input[^>]*type="checkbox"[^>]*>)([\s\S]*?)(<\/li>)/g,
        (_, liOpen, input, content, liClose) =>
            `${liOpen}${input}<span class="task-label">${content.trim()}</span>${liClose}`
    );
}

/** Markdown + CSS から PDF 用の完全 HTML 文字列を組み立てる。 */
function buildHtml(markdownBody: string, css: string): string {
    const rawHtml = marked.parse(markdownBody) as string;
    const htmlBody = wrapTaskLabels(rawHtml);
    return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>${css}</style>
</head>
<body class="markdown-body">
${htmlBody}
</body>
</html>`;
}

/**
 * ローカル Chrome ヘッドレスで PDF を生成してファイルに保存する。
 * @param document エクスポート対象の TextDocument
 * @param extensionPath 拡張機能のルートディレクトリ（media/ の親）
 */
export async function exportToPdfLocal(
    document: vscode.TextDocument,
    extensionPath: string
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

    const html = buildHtml(body, css);

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
