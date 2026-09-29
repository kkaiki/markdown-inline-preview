/**
 * Marp スライド書き出し（PRO+）の host 側。開いている .md を 1 スライド 1 ページの PDF（`<名前>.slides.pdf`）にする。
 *
 * HTML の組み立ては `src/shared/marp/marpHtml.ts`（純関数）。marp-core は 1 MB あるので拡張本体には入れず、
 * 別バンドル `out/marp.js`（scripts/build-marp.mjs）を書き出し時にだけ require する。
 * PDF 化は PDF 書き出しと同じローカル Chrome（`printHtmlToPdf`）。課金の判定は呼び出し側で済ませてから呼ぶ。
 * 設計: docs/private/specifications/pro-marp-export.md
 */
import * as vscode from 'vscode';
import * as path from 'path';
import type { MarpHtmlOptions, MarpHtmlResult } from '../../shared/marp/marpHtml';
import { offerToOpen, printHtmlToPdf } from './localExport';

interface MarpBundle {
    buildMarpHtml(markdown: string, options: MarpHtmlOptions): MarpHtmlResult;
}

/** Chrome の印刷は Marp（SVG の foreignObject）だと重く、30 秒を超えることがあった（設計書 R4）。 */
const MARP_PRINT_TIMEOUT_MS = 90_000;

export async function exportMarpLocal(document: vscode.TextDocument, extensionPath: string): Promise<void> {
    if (document.uri.scheme !== 'file') {
        throw new Error(vscode.l10n.t('PDF export requires a saved file. Please save the document first.'));
    }

    const marp = require(path.join(extensionPath, 'out', 'marp.js')) as MarpBundle;
    const base = document.uri.fsPath.replace(/\.(md|markdown)$/i, '');
    const { html } = marp.buildMarpHtml(document.getText(), {
        // 数式のフォントは同梱の KaTeX（外部へ取りに行かない）
        katexFontPath: `${vscode.Uri.file(path.join(extensionPath, 'media', 'fonts')).toString()}/`,
        title: path.basename(base)
    });

    const outputPdf = `${base}.slides.pdf`;
    await printHtmlToPdf(html, document.uri.fsPath, outputPdf, vscode.l10n.t('Exporting slides…'), MARP_PRINT_TIMEOUT_MS);
    void offerToOpen(outputPdf, vscode.l10n.t('Slides saved: {0}', path.basename(outputPdf)));
}
