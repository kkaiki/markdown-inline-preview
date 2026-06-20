import * as vscode from 'vscode';

import type { RawHandlerDeps } from './types';

export function registerOnDidChangeActiveEditor(
    context: vscode.ExtensionContext,
    deps: RawHandlerDeps
): void {
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor && editor.document.languageId === 'markdown') {
                deps.updateAllDecorations(editor);
            }
        })
    );
}
