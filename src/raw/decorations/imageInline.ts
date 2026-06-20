import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

const IMAGE_LINE_PATTERN = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/;

function resolveImagePath(url: string, documentPath: string): string | undefined {
    const trimmed = url.trim();
    if (/^https?:/i.test(trimmed)) return undefined;
    if (trimmed.startsWith('/')) return trimmed;
    return path.resolve(path.dirname(documentPath), trimmed);
}

export function updateImageInlineDecorations(
    editor: vscode.TextEditor,
    decoration: vscode.TextEditorDecorationType,
    editingLine: number,
    enabled: boolean
): void {
    if (!enabled) {
        editor.setDecorations(decoration, []);
        return;
    }

    const document = editor.document;
    const decorations: vscode.DecorationOptions[] = [];

    for (let i = 0; i < document.lineCount; i++) {
        if (i === editingLine) continue;

        const lineText = document.lineAt(i).text;
        const match = lineText.match(IMAGE_LINE_PATTERN);
        if (!match) continue;

        const range = new vscode.Range(i, 0, i, lineText.length);
        const imagePath = resolveImagePath(match[2], document.uri.fsPath);

        if (imagePath && fs.existsSync(imagePath)) {
            decorations.push({
                range,
                renderOptions: {
                    after: {
                        contentIconPath: vscode.Uri.file(imagePath),
                        margin: '0 0 0 8px',
                        width: '48px',
                        height: '48px'
                    }
                }
            });
        } else {
            decorations.push({
                range,
                renderOptions: {
                    after: {
                        contentText: ' [image preview unavailable]',
                        color: new vscode.ThemeColor('descriptionForeground')
                    }
                }
            });
        }
    }

    editor.setDecorations(decoration, decorations);
}
