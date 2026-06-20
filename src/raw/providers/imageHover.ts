import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

const IMAGE_PATTERN = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/;

function resolveImagePath(url: string, documentUri: vscode.Uri): string | undefined {
    const trimmed = url.trim();
    if (/^https?:/i.test(trimmed)) return trimmed;
    if (trimmed.startsWith('/')) return trimmed;
    return path.resolve(path.dirname(documentUri.fsPath), trimmed);
}

function buildImageHover(document: vscode.TextDocument, line: number, alt: string, url: string): vscode.Hover | undefined {
    const resolved = resolveImagePath(url, document.uri);
    if (!resolved) return undefined;

    const md = new vscode.MarkdownString();
    md.supportHtml = true;
    md.isTrusted = true;

    if (/^https?:/i.test(resolved)) {
        md.appendMarkdown(`![${alt}](${resolved})`);
        return new vscode.Hover(md, new vscode.Range(line, 0, line, document.lineAt(line).text.length));
    }

    if (!fs.existsSync(resolved)) {
        md.appendMarkdown(`_Image not found:_ \`${url}\``);
        return new vscode.Hover(md);
    }

    const fileUri = vscode.Uri.file(resolved);
    md.appendMarkdown(`![${alt || 'image'}](${fileUri.toString()})`);
    return new vscode.Hover(md, new vscode.Range(line, 0, line, document.lineAt(line).text.length));
}

export function registerImageHoverProvider(
    context: vscode.ExtensionContext,
    isEnabled: () => boolean
): vscode.Disposable {
    return vscode.languages.registerHoverProvider('markdown', {
        provideHover(document, position) {
            if (!isEnabled()) return undefined;

            const line = position.line;
            if (line < 0 || line >= document.lineCount) return undefined;

            const lineText = document.lineAt(line).text;
            const match = lineText.match(IMAGE_PATTERN);
            if (!match) return undefined;

            return buildImageHover(document, line, match[1], match[2]);
        }
    });
}
