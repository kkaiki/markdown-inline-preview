import * as vscode from 'vscode';

import type { ConvertType } from '../../types';
import { convertLineToType as convertLineTextToType } from '../../shared/structure/list';
import { renumberLists } from './renumberLists';

/** 選択行を変換する。続く番号の振り直しまで終えて解決する Thenable を返す */
export function convertLineToType(editor: vscode.TextEditor, targetType: ConvertType): Thenable<unknown> {
    const document = editor.document;
    const selection = editor.selection;
    const startLine = selection.start.line;
    const endLine = selection.end.line;

    return editor.edit(editBuilder => {
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
                return renumberLists(editor);
            } catch {
                // ignore renumber failures on partial edits
            }
        }
        return undefined;
    });
}
