import * as vscode from 'vscode';

import type { ConvertType } from '../../types';
import { convertLineToType as convertLineTextToType } from '../../shared/structure/list';
import { renumberLists } from './renumberLists';

export function convertLineToType(editor: vscode.TextEditor, targetType: ConvertType): void {
    const document = editor.document;
    const selection = editor.selection;
    const startLine = selection.start.line;
    const endLine = selection.end.line;

    editor.edit(editBuilder => {
        for (let i = startLine; i <= endLine; i++) {
            const line = document.lineAt(i).text;
            const newLine = convertLineTextToType(line, targetType);
            if (newLine === line) {
                continue;
            }
            const range = new vscode.Range(i, 0, i, line.length);
            editBuilder.replace(range, newLine);
        }
    }).then(() => {
        if (targetType === 'numbered') {
            try {
                renumberLists(editor);
            } catch {
                // ignore renumber failures on partial edits
            }
        }
    });
}
