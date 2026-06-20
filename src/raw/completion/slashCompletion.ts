import * as vscode from 'vscode';

import { SLASH_MENU_ITEMS } from '../../shared/slash/slashMenuItems';
import { isInFencedCodeBlock } from './helpers';

export function registerSlashCommandCompletion(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(
            { language: 'markdown' },
            {
                provideCompletionItems(document, position) {
                    if (isInFencedCodeBlock(document, position.line)) return null;

                    const lineText = document.lineAt(position.line).text;
                    const beforeCursor = lineText.substring(0, position.character);
                    if (!beforeCursor.startsWith('/')) return null;

                    const lineRange = new vscode.Range(
                        position.line, 0,
                        position.line, lineText.length
                    );

                    return SLASH_MENU_ITEMS.map(item => {
                        const completionItem = new vscode.CompletionItem(
                            item.label,
                            vscode.CompletionItemKind.Snippet
                        );
                        completionItem.detail = item.detail;
                        completionItem.insertText = new vscode.SnippetString(item.rawSnippet);
                        completionItem.range = lineRange;
                        completionItem.filterText = item.filterText;
                        completionItem.sortText = item.sortOrder;
                        return completionItem;
                    });
                }
            },
            '/'
        )
    );
}
