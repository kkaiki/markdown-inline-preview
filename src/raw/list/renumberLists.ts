import * as vscode from 'vscode';

import { getIndentLevel } from '../../shared/structure/list';

export function renumberLists(editor: vscode.TextEditor, lineNumber: number | null = null): void {
    const document = editor.document;
    const selection = editor.selection;
    const currentLine = lineNumber ?? selection.active.line;

    const lineText = document.lineAt(currentLine).text;
    const match = lineText.match(/^(\s*)(\d+)([\.)])\s*/);

    if (!match) {
        return;
    }

    let startLine = currentLine;
    let endLine = currentLine;

    for (let i = currentLine - 1; i >= 0; i--) {
        const text = document.lineAt(i).text;

        if (text.trim() === '') {
            break;
        }

        if (text.match(/^(\s*)(\d+)([\.)])\s*/)) {
            startLine = i;
        } else {
            break;
        }
    }

    for (let i = currentLine + 1; i < document.lineCount; i++) {
        const text = document.lineAt(i).text;

        if (text.trim() === '') {
            break;
        }

        if (text.match(/^(\s*)(\d+)([\.)])\s*/)) {
            endLine = i;
        } else {
            break;
        }
    }

    const indentCounters = new Map<number, number>();
    let previousLevel = -1;

    editor.edit(editBuilder => {
        for (let i = startLine; i <= endLine; i++) {
            const line = document.lineAt(i).text;

            if (line.trim() === '') {
                continue;
            }

            const m = line.match(/^(\s*)(\d+)([\.)])\s*(.*)/);

            if (m) {
                const indent = m[1];
                const punct = m[3];
                const content = m[4];

                const level = getIndentLevel(indent);

                if (level < previousLevel) {
                    for (const [key] of indentCounters.entries()) {
                        if (key > level) {
                            indentCounters.delete(key);
                        }
                    }
                }

                if (!indentCounters.has(level)) {
                    indentCounters.set(level, 1);
                } else {
                    indentCounters.set(level, (indentCounters.get(level) ?? 0) + 1);
                }

                for (const [key] of indentCounters.entries()) {
                    if (key > level) {
                        indentCounters.delete(key);
                    }
                }

                previousLevel = level;
                const newNumber = indentCounters.get(level) ?? 1;
                const newLine = content.length > 0
                    ? `${indent}${newNumber}${punct} ${content}`
                    : `${indent}${newNumber}${punct} `;

                const range = new vscode.Range(i, 0, i, line.length);
                editBuilder.replace(range, newLine);
            }
        }
    });
}
