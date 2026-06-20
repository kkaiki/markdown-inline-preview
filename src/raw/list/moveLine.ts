import * as vscode from 'vscode';

import { formatTableAtLine } from '../table';

export function moveLineWithHierarchy(
    editor: vscode.TextEditor | undefined,
    direction: 'up' | 'down'
): void {
    if (!editor) return;

    const selection = editor.selection;
    const startLine = selection.start.line;
    const endLine = selection.end.line;
    const document = editor.document;

    if (direction === 'up' && startLine === 0) return;
    if (direction === 'down' && endLine === document.lineCount - 1) return;

    const indentMatch = document.lineAt(startLine).text.match(/^\s*/);
    const currentIndent = indentMatch ? indentMatch[0].length : 0;
    let blockEndLine = endLine;

    for (let i = endLine + 1; i < document.lineCount; i++) {
        const line = document.lineAt(i).text;
        if (line.trim() === '') break;
        const lineIndentMatch = line.match(/^\s*/);
        const indent = lineIndentMatch ? lineIndentMatch[0].length : 0;
        if (indent <= currentIndent) break;
        blockEndLine = i;
    }

    let targetIndent = currentIndent;
    const targetLine = direction === 'up' ? startLine - 1 : blockEndLine + 1;

    if (direction === 'up') {
        if (targetLine >= 0) {
            const targetText = document.lineAt(targetLine).text;
            if (targetText.trim() !== '') {
                if (targetText.match(/^\s*[-*+\d]|^\s*-\s\[/)) {
                    const targetIndentMatch = targetText.match(/^\s*/);
                    targetIndent = targetIndentMatch ? targetIndentMatch[0].length : 0;
                }
            }
        }
    } else if (targetLine < document.lineCount) {
        const targetText = document.lineAt(targetLine).text;
        if (targetText.trim() !== '') {
            if (targetText.match(/^\s*[-*+\d]|^\s*-\s\[/)) {
                const targetIndentMatch = targetText.match(/^\s*/);
                targetIndent = targetIndentMatch ? targetIndentMatch[0].length : 0;
            }
        }
    }

    const indentDiff = targetIndent - currentIndent;
    const indentString = indentDiff > 0 ? ' '.repeat(indentDiff) : '';

    editor.edit(editBuilder => {
        const lines: string[] = [];
        for (let i = startLine; i <= blockEndLine; i++) {
            let lineText = document.lineAt(i).text;
            if (indentDiff > 0) {
                lineText = indentString + lineText;
            } else if (indentDiff < 0) {
                lineText = lineText.substring(-indentDiff);
            }
            lines.push(lineText);
        }
        const blockText = lines.join('\n');

        if (direction === 'up') {
            const lineAbove = document.lineAt(targetLine).text;

            const deleteRange = new vscode.Range(
                targetLine, 0,
                blockEndLine + 1, 0
            );
            const newText = blockText + '\n' + lineAbove + '\n';
            editBuilder.replace(deleteRange, newText);
        } else {
            const lineBelow = document.lineAt(targetLine).text;

            const deleteRange = new vscode.Range(
                startLine, 0,
                targetLine + 1, 0
            );
            const newText = lineBelow + '\n' + blockText + '\n';
            editBuilder.replace(deleteRange, newText);
        }
    }).then(() => {
        const lineDiff = direction === 'up' ? -1 : 1;
        const newSelection = new vscode.Selection(
            startLine + lineDiff, selection.start.character,
            endLine + lineDiff, selection.end.character
        );
        editor.selection = newSelection;
        try {
            formatTableAtLine(editor, editor.selection.active.line);
        } catch {
            // ignore table format failures after line move
        }
    });
}
