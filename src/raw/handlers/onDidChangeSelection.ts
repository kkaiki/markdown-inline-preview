import * as vscode from 'vscode';

import { rawRuntime } from '../../core/runtime';
import { rawDecorationState } from '../decorations/state';
import { updateAllDecorations } from '../decorations/updaters';
import type { RawHandlerDeps } from './types';

export function registerOnDidChangeSelection(
    context: vscode.ExtensionContext,
    deps: RawHandlerDeps
): void {
    deps.debugLog('Registering onDidChangeTextEditorSelection event handler');
    context.subscriptions.push(
        vscode.window.onDidChangeTextEditorSelection(event => {
            const editor = event.textEditor;

            deps.debugLog(`[EVENT] Selection changed - Editor: ${editor ? editor.document.fileName : 'none'}`);

            if (!editor || editor.document.languageId !== 'markdown') {
                deps.debugLog(
                    `Selection changed: Not a markdown file (language: ${editor ? editor.document.languageId : 'no editor'})`
                );
                return;
            }

            const position = event.selections[0].active;

            if (position.line !== rawDecorationState.currentEditingLine) {
                const previousEditingLine = rawDecorationState.currentEditingLine;
                rawDecorationState.currentEditingLine = position.line;

                deps.debugLog(`Line changed: ${previousEditingLine} -> ${rawDecorationState.currentEditingLine}`);

                if (previousEditingLine !== -1 && previousEditingLine !== position.line) {
                    try {
                        const prevLine = editor.document.lineAt(previousEditingLine).text;
                        deps.debugLog(`Previous line text: "${prevLine}"`);

                        if (deps.isAutoTableFormattingEnabled() && prevLine.includes('|')) {
                            deps.debugLog(`Table detected on line ${previousEditingLine}, formatting...`);
                            deps.formatTableAtLine(editor, previousEditingLine);
                        } else {
                            deps.debugLog('Previous line is not a table (no | character)');
                        }
                    } catch (e) {
                        const error = e as Error;
                        deps.debugLog(`Error reading previous line: ${error.message}`);
                    }
                }

                if (previousEditingLine !== -1 || rawDecorationState.currentEditingLine !== -1) {
                    updateAllDecorations(editor);
                }
            }

            if (event.kind === vscode.TextEditorSelectionChangeKind.Mouse) {
                const selection = event.selections[0];
                const isSelecting = !selection.isEmpty;

                if (isSelecting) {
                    rawRuntime.isDragging = true;
                } else if (rawRuntime.isDragging) {
                    rawRuntime.isDragging = false;
                    return;
                }

                if (!rawRuntime.isDragging && selection.isEmpty) {
                    const line = editor.document.lineAt(position.line);
                    const text = line.text;

                    // `- [x]` または `- [ ]` で始まる行のプレフィックス範囲内クリックでトグル。
                    // 旧実装は `[x]` の 3 文字（`[`〜`]`）のみだったが、`-` や空白も含む
                    // プレフィックス全体に広げることでチェックボックスをクリックしやすくした。
                    const checkboxMatch = text.match(/^(\s*-\s\[[\sx]?\])/i);
                    if (deps.isCheckboxMouseToggleEnabled() && checkboxMatch) {
                        if (position.character < checkboxMatch[1].length) {
                            setTimeout(() => {
                                void vscode.commands.executeCommand('markdownInline.clickCheckbox');
                            }, 10);
                        }
                    }
                }
            }
        })
    );
}
