import * as vscode from 'vscode';

import { debugLog } from '../../core';
import { updateAllDecorations } from '../decorations';

interface TaskInfo {
    line: number;
    text: string;
    isChecked: boolean;
}

function moveCompletedTaskToBottom(editor: vscode.TextEditor, lineNumber: number): void {
    const document = editor.document;
    const currentLine = document.lineAt(lineNumber).text;
    const indentMatch = currentLine.match(/^\s*/);
    const currentIndent = indentMatch ? indentMatch[0].length : 0;
    const isCompleted = currentLine.match(/^\s*-\s\[[xX]\]/);

    let taskStart = lineNumber;
    let taskEnd = lineNumber;
    let lastUncheckedLine = -1;
    let firstCheckedLine = -1;
    const tasks: TaskInfo[] = [];

    for (let i = lineNumber - 1; i >= 0; i--) {
        const line = document.lineAt(i).text;
        if (line.trim() === '') break;

        const lineIndentMatch = line.match(/^\s*/);
        const lineIndent = lineIndentMatch ? lineIndentMatch[0].length : 0;
        if (lineIndent < currentIndent) break;
        if (lineIndent === currentIndent && line.match(/^\s*-\s\[[ xX]\]/)) {
            taskStart = i;
        }
        if (lineIndent > currentIndent) break;
    }

    for (let i = lineNumber + 1; i < document.lineCount; i++) {
        const line = document.lineAt(i).text;
        if (line.trim() === '') break;

        const lineIndentMatch = line.match(/^\s*/);
        const lineIndent = lineIndentMatch ? lineIndentMatch[0].length : 0;
        if (lineIndent < currentIndent) break;
        if (lineIndent === currentIndent && line.match(/^\s*-\s\[[ xX]\]/)) {
            taskEnd = i;
        }
        if (lineIndent > currentIndent) break;
    }

    for (let i = taskStart; i <= taskEnd; i++) {
        const line = document.lineAt(i).text;
        const lineIndentMatch = line.match(/^\s*/);
        const lineIndent = lineIndentMatch ? lineIndentMatch[0].length : 0;

        if (lineIndent === currentIndent && line.match(/^\s*-\s\[[ xX]\]/)) {
            const isChecked = line.match(/^\s*-\s\[[xX]\]/);
            tasks.push({ line: i, text: line, isChecked: !!isChecked });

            if (!isChecked && i !== lineNumber) {
                lastUncheckedLine = i;
            }
            if (isChecked && firstCheckedLine === -1 && i !== lineNumber) {
                firstCheckedLine = i;
            }
        }
    }

    let targetLine = -1;

    if (isCompleted) {
        targetLine = lastUncheckedLine !== -1 ? lastUncheckedLine : taskEnd;
    } else if (firstCheckedLine !== -1) {
        targetLine = firstCheckedLine - 1;
    }

    if (targetLine !== -1 && targetLine !== lineNumber) {
        editor.edit(editBuilder => {
            const textToMove = currentLine + '\n';

            if (targetLine < lineNumber) {
                editBuilder.insert(new vscode.Position(targetLine + 1, 0), textToMove);
                editBuilder.delete(new vscode.Range(
                    lineNumber + 1, 0,
                    lineNumber + 2, 0
                ));
            } else {
                editBuilder.delete(new vscode.Range(
                    lineNumber, 0,
                    lineNumber + 1, 0
                ));
                editBuilder.insert(new vscode.Position(targetLine, 0), textToMove);
            }
        }).then(() => {
            const action = isCompleted ? 'completed' : 'unchecked';
            debugLog(`[moveCompletedTaskToBottom] Moved ${action} task from line ${lineNumber} to ${targetLine}`);
        });
    }
}

export function toggleCheckbox(editor: vscode.TextEditor, lineNumber: number): void {
    const line = editor.document.lineAt(lineNumber).text;
    let newLine: string;
    let shouldMoveToBottom = false;
    let cursorPosition: number | null = null;

    debugLog(`[toggleCheckbox] Toggling line ${lineNumber}: "${line}"`);

    if (line.includes('- [ ]')) {
        newLine = line.replace('- [ ]', '- [x]');
        shouldMoveToBottom = vscode.workspace.getConfiguration('markdownInline').get<boolean>('autoMoveCompletedTasks', false) ?? false;
        const checkboxEndMatch = newLine.match(/^(\s*-\s\[[xX]\]\s*)/);
        if (checkboxEndMatch) {
            cursorPosition = checkboxEndMatch[1].length;
        }
        debugLog('[toggleCheckbox] Checking checkbox');
    } else if (line.includes('- [x]') || line.includes('- [X]')) {
        newLine = line.replace(/- \[[xX]\]/, '- [ ]');
        const checkboxEndMatch = newLine.match(/^(\s*-\s\[\s\]\s*)/);
        if (checkboxEndMatch) {
            cursorPosition = checkboxEndMatch[1].length;
        }
        debugLog('[toggleCheckbox] Unchecking checkbox');
    } else {
        return;
    }

    editor.edit(editBuilder => {
        const range = new vscode.Range(
            lineNumber, 0,
            lineNumber, line.length
        );
        editBuilder.replace(range, newLine);
    }).then(() => {
        if (cursorPosition !== null) {
            const newPosition = new vscode.Position(lineNumber, cursorPosition);
            editor.selection = new vscode.Selection(newPosition, newPosition);
        }

        if (shouldMoveToBottom) {
            moveCompletedTaskToBottom(editor, lineNumber);
        }

        debugLog('[toggleCheckbox] Edit complete, updating decorations');
        updateAllDecorations(editor);
    });
}
