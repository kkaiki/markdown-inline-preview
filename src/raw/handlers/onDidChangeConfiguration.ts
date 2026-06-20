import * as vscode from 'vscode';

import type { RawHandlerDeps } from './types';

export function registerOnDidChangeConfiguration(
    context: vscode.ExtensionContext,
    deps: RawHandlerDeps
): void {
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration('markdownInline.headingColorScheme')) {
                deps.rebuildHeadingDecorations();
            }
        })
    );

    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(event => {
            if (!event.affectsConfiguration('markdownInline')) {
                return;
            }

            if (
                event.affectsConfiguration('markdownInline.advanced.disableCompetingMarkdownFeatures') &&
                deps.shouldDisableCompetingMarkdownFeatures()
            ) {
                deps.applyMarkdownSettings();
            }

            const activeEditor = vscode.window.activeTextEditor;
            if (activeEditor && activeEditor.document.languageId === 'markdown') {
                deps.updateAllDecorations(activeEditor);
            }
        })
    );
}
