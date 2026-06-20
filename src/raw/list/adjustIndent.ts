import * as vscode from 'vscode';

import { getAllTableCells, getTableCellInfo } from '../table';
import { renumberLists } from './renumberLists';

export function adjustIndent(editor: vscode.TextEditor, increase: boolean): void {
    const selection = editor.selection;
    const document = editor.document;
    const indentStr = '  ';

    if (selection.isEmpty) {
        const position = selection.active;
        const lineText = document.lineAt(position.line).text;
        const cellInfo = getTableCellInfo(lineText, position.character);

        if (cellInfo && cellInfo.isTable && cellInfo.cellIndex >= 0) {
            if (increase) {
                if (cellInfo.cellIndex < cellInfo.allCells.length - 1) {
                    const nextCell = cellInfo.allCells[cellInfo.cellIndex + 1];
                    const newPosition = new vscode.Position(position.line, nextCell.contentStart);
                    editor.selection = new vscode.Selection(newPosition, newPosition);
                } else {
                    const nextLineIndex = position.line + 1;
                    if (nextLineIndex < document.lineCount) {
                        const nextLineText = document.lineAt(nextLineIndex).text;
                        const nextLineCells = getAllTableCells(nextLineText);
                        if (nextLineCells && nextLineCells.length > 0) {
                            const newPosition = new vscode.Position(nextLineIndex, nextLineCells[0].contentStart);
                            editor.selection = new vscode.Selection(newPosition, newPosition);
                        }
                    }
                }
            } else if (cellInfo.cellIndex > 0) {
                const prevCell = cellInfo.allCells[cellInfo.cellIndex - 1];
                const newPosition = new vscode.Position(position.line, prevCell.contentStart);
                editor.selection = new vscode.Selection(newPosition, newPosition);
            } else {
                const prevLineIndex = position.line - 1;
                if (prevLineIndex >= 0) {
                    const prevLineText = document.lineAt(prevLineIndex).text;
                    const prevLineCells = getAllTableCells(prevLineText);
                    if (prevLineCells && prevLineCells.length > 0) {
                        const lastCell = prevLineCells[prevLineCells.length - 1];
                        const newPosition = new vscode.Position(prevLineIndex, lastCell.contentStart);
                        editor.selection = new vscode.Selection(newPosition, newPosition);
                    }
                }
            }
            return;
        }
    }

    if (!selection.isEmpty) {
        const startLine = selection.start.line;
        const endLine = selection.end.line;

        editor.edit(editBuilder => {
            for (let i = startLine; i <= endLine; i++) {
                const line = document.lineAt(i).text;
                const range = new vscode.Range(i, 0, i, line.length);

                if (increase) {
                    editBuilder.replace(range, indentStr + line);
                } else {
                    let newLine = line;
                    if (/^\t/.test(newLine)) {
                        newLine = newLine.replace(/^\t/, '');
                    } else if (newLine.startsWith('  ')) {
                        newLine = newLine.slice(2);
                    } else if (/^ /.test(newLine)) {
                        newLine = newLine.slice(1);
                    }
                    if (newLine !== line) editBuilder.replace(range, newLine);
                }
            }
        }).then(() => {
            try {
                renumberLists(editor);
            } catch {
                // ignore renumber failures
            }
        });
        return;
    }

    const line = document.lineAt(selection.active.line).text;
    const cursorPos = selection.active.character;

    editor.edit(editBuilder => {
        const range = new vscode.Range(
            selection.active.line, 0,
            selection.active.line, line.length
        );

        if (increase) {
            editBuilder.replace(range, indentStr + line);
        } else {
            let newLine = line;
            if (/^\t/.test(newLine)) {
                newLine = newLine.replace(/^\t/, '');
            } else if (newLine.startsWith('  ')) {
                newLine = newLine.slice(2);
            } else if (/^ /.test(newLine)) {
                newLine = newLine.slice(1);
            }
            if (newLine !== line) editBuilder.replace(range, newLine);
        }
    }).then(() => {
        if (increase) {
            const newPosition = new vscode.Position(selection.active.line, cursorPos + 2);
            editor.selection = new vscode.Selection(newPosition, newPosition);
        } else {
            const currentLine = document.lineAt(selection.active.line).text;
            const diff = line.length - currentLine.length;
            const newPos = Math.max(0, cursorPos - diff);
            const newPosition = new vscode.Position(selection.active.line, newPos);
            editor.selection = new vscode.Selection(newPosition, newPosition);
        }
        try {
            renumberLists(editor);
        } catch {
            // ignore renumber failures
        }
    });
}
