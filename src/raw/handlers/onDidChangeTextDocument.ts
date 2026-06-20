import * as vscode from 'vscode';

import { rawRuntime } from '../../core/runtime';
import type { RawHandlerDeps } from './types';

export function registerOnDidChangeTextDocument(
    context: vscode.ExtensionContext,
    deps: RawHandlerDeps
): void {
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(event => {
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.document !== event.document) return;
            if (editor.document.languageId !== 'markdown') return;

            if (event.contentChanges.length > 0) {
                const change = event.contentChanges[0];
                const changeText = change.text;

                if (deps.isCodeBlockAutoCompleteEnabled() && changeText === '```') {
                    const position = editor.selection.active;
                    const line = position.line;
                    const character = position.character;

                    let codeBlockCount = 0;
                    for (let i = 0; i <= line; i++) {
                        const lineText = editor.document.lineAt(i).text;
                        const matches = lineText.match(/```/g);
                        if (matches) {
                            if (i < line) {
                                codeBlockCount += matches.length;
                            } else {
                                const beforeText = lineText.substring(0, character);
                                const beforeMatches = beforeText.match(/```/g);
                                if (beforeMatches) {
                                    codeBlockCount += beforeMatches.length;
                                }
                            }
                        }
                    }

                    if (codeBlockCount % 2 === 1) {
                        void editor.edit(editBuilder => {
                            const currentLine = editor.document.lineAt(line);
                            const endOfLine = new vscode.Position(line, currentLine.text.length);
                            editBuilder.insert(endOfLine, '\n\n```');
                        }).then(() => {
                            const newPosition = new vscode.Position(line + 1, 0);
                            editor.selection = new vscode.Selection(newPosition, newPosition);
                        });
                    }
                }
            }

            if (rawRuntime.updateTimer) clearTimeout(rawRuntime.updateTimer);
            rawRuntime.updateTimer = setTimeout(() => {
                deps.updateAllDecorations(editor);
            }, 50);

            const hasHeadingChange = event.contentChanges.some(change => {
                const startLine = change.range.start.line;
                const endLine = change.range.end.line;
                for (let i = startLine; i <= endLine; i++) {
                    if (i < editor.document.lineCount) {
                        const lineText = editor.document.lineAt(i).text;
                        if (lineText.match(/^#{1,6}\s/) || change.text.match(/^#{1,6}\s/)) {
                            return true;
                        }
                    }
                }
                return false;
            });

            if (hasHeadingChange && deps.isAutoUpdateTocEnabled()) {
                if (rawRuntime.tocUpdateTimer) clearTimeout(rawRuntime.tocUpdateTimer);
                rawRuntime.tocUpdateTimer = setTimeout(() => {
                    const text = editor.document.getText();
                    if (text.includes('/目次') || text.includes('/toc')) {
                        void deps.updateTableOfContents(editor, true);
                    }
                }, 500);
            }
        })
    );
}
