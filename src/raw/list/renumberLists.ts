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

    // 空行が1つだけの場合、それがネスト行（インデントあり）どうしを区切っているときだけ
    // 同じリスト（loose list）の続きとみなして跨ぐ。トップレベルの項目どうしを区切る空行は
    // 別のリストとの境界とみなして止める（ユーザーが意図して 2 つのリストを空行で分けている
    // ケースの方が一般的なため）。2 つ以上連続する空行は、ネストの有無によらず常に止める。
    let blankRun = 0;
    let lastMatchedIndent: string | null = match[1];
    for (let i = currentLine - 1; i >= 0; i--) {
        const text = document.lineAt(i).text;

        if (text.trim() === '') {
            blankRun++;
            if (blankRun >= 2 || !lastMatchedIndent) break;
            continue;
        }

        const m = text.match(/^(\s*)(\d+)([\.)])\s*/);
        if (m) {
            startLine = i;
            lastMatchedIndent = m[1];
            blankRun = 0;
        } else {
            break;
        }
    }

    blankRun = 0;
    lastMatchedIndent = match[1];
    for (let i = currentLine + 1; i < document.lineCount; i++) {
        const text = document.lineAt(i).text;

        if (text.trim() === '') {
            blankRun++;
            if (blankRun >= 2 || !lastMatchedIndent) break;
            continue;
        }

        const m = text.match(/^(\s*)(\d+)([\.)])\s*/);
        if (m) {
            endLine = i;
            lastMatchedIndent = m[1];
            blankRun = 0;
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
