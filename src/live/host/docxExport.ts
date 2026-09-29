/**
 * Word（.docx）書き出し（PRO+）の host 側。開いている .md を `<名前>.docx` にする。
 *
 * 変換は `src/shared/docx/`（純関数）。`docx` は大きいので拡張本体には入れず、
 * 別バンドル `out/docxExport.js`（scripts/build-lazy-bundles.mjs）を書き出し時にだけ require する。
 * 課金の判定は呼び出し側で済ませてから呼ぶ。設計: docs/private/specifications/pro-docx-export.md §3
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import type { MarkdownToDocxOptions } from '../../shared/docx/markdownDocx';
import { offerToOpen } from './localExport';

interface DocxBundle {
    exportDocx(markdown: string, opts: MarkdownToDocxOptions): Promise<{ data: Uint8Array; warnings: string[] }>;
}

/** 埋め込む画像 1 枚の上限。巨大な画像で固まらないように。 */
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

/** 文書からの相対パス（`./img/a.png`・`../a.png`）を読む。リモートは変換側で弾かれて渡ってこない。 */
function readLocalImage(docDir: string, src: string): { data: Uint8Array } | undefined {
    try {
        const file = path.resolve(docDir, decodeURIComponent(src.replace(/^file:\/\//, '')));
        const stat = fs.statSync(file);
        if (!stat.isFile() || stat.size > MAX_IMAGE_BYTES) return undefined;
        return { data: fs.readFileSync(file) };
    } catch {
        return undefined;
    }
}

/**
 * 同名の .docx が既にあるときだけ確認する（書き出し後に Word で手直しされることが多く、
 * 黙って上書きすると編集が消えるため）。戻り値は書き出し先。中止なら undefined。
 */
async function confirmOutputPath(outputPath: string): Promise<string | undefined> {
    if (!fs.existsSync(outputPath)) return outputPath;
    const replace = vscode.l10n.t('Replace');
    const saveAs = vscode.l10n.t('Save As…');
    const choice = await vscode.window.showWarningMessage(
        vscode.l10n.t('{0} already exists.', path.basename(outputPath)),
        { modal: true },
        replace,
        saveAs
    );
    if (choice === replace) return outputPath;
    if (choice === saveAs) {
        const picked = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(outputPath),
            filters: { Word: ['docx'] }
        });
        return picked?.fsPath;
    }
    return undefined;
}

export async function exportDocxLocal(document: vscode.TextDocument, extensionPath: string): Promise<void> {
    if (document.uri.scheme !== 'file') {
        throw new Error(vscode.l10n.t('Word export requires a saved file. Please save the document first.'));
    }

    const base = document.uri.fsPath.replace(/\.(md|markdown)$/i, '');
    const outputPath = await confirmOutputPath(`${base}.docx`);
    if (!outputPath) return;

    const bundle = require(path.join(extensionPath, 'out', 'docxExport.js')) as DocxBundle;
    const docDir = path.dirname(document.uri.fsPath);
    const { data } = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: vscode.l10n.t('Exporting Word…'), cancellable: false },
        () => bundle.exportDocx(document.getText(), {
            title: path.basename(base),
            resolveImage: (src) => readLocalImage(docDir, src)
        })
    );

    try {
        fs.writeFileSync(outputPath, data);
    } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        // Windows で Word が開いているファイルは書き込めない
        if (code === 'EBUSY' || code === 'EPERM') {
            throw new Error(vscode.l10n.t('Close the file in Word and try again.'));
        }
        throw err;
    }
    void offerToOpen(outputPath, vscode.l10n.t('Word file saved: {0}', path.basename(outputPath)));
}
