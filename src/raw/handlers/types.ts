import type * as vscode from 'vscode';

export interface RawHandlerDeps {
    debugLog: (message: string, ...args: unknown[]) => void;
    isCodeBlockAutoCompleteEnabled: () => boolean;
    updateAllDecorations: (editor: vscode.TextEditor) => void;
    isAutoTableFormattingEnabled: () => boolean;
    formatTableAtLine: (editor: vscode.TextEditor, lineIndex: number) => void;
    isCheckboxMouseToggleEnabled: () => boolean;
    shouldDisableCompetingMarkdownFeatures: () => boolean;
    applyMarkdownSettings: () => void;
    rebuildHeadingDecorations: () => void;
}
