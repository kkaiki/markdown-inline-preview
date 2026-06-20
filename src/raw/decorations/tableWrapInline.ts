import * as vscode from 'vscode';
import {
    formatWrappedTablePreview,
    isSeparatorRow,
    parseTableCells
} from '../../shared/table/tableWrap';

export function updateTableWrapInlineDecorations(
    editor: vscode.TextEditor,
    decoration: vscode.TextEditorDecorationType,
    editingLine: number,
    enabled: boolean,
    colWidth: number
): void {
    if (!enabled) {
        editor.setDecorations(decoration, []);
        return;
    }

    const document = editor.document;
    const decorations: vscode.DecorationOptions[] = [];
    const width = Math.max(8, colWidth);

    for (let i = 0; i < document.lineCount; i++) {
        if (i === editingLine) continue;

        const lineText = document.lineAt(i).text;
        const cells = parseTableCells(lineText);
        if (!cells || isSeparatorRow(cells)) continue;

        const preview = formatWrappedTablePreview(cells, width);
        if (preview === lineText.trim()) continue;

        decorations.push({
            range: new vscode.Range(i, 0, i, lineText.length),
            renderOptions: {
                after: {
                    contentText: `  ↳ ${preview}`,
                    color: new vscode.ThemeColor('descriptionForeground'),
                    fontStyle: 'italic'
                }
            }
        });
    }

    editor.setDecorations(decoration, decorations);
}
