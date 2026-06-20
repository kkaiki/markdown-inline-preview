import type * as vscode from 'vscode';

export interface CodeBlock {
    language: string;
    startLine: number;
    endLine: number;
}

export const rawDecorationState = {
    checkedDecoration: null as vscode.TextEditorDecorationType | null,
    headingDecorations: [] as vscode.TextEditorDecorationType[],
    codeBlockDecoration: null as vscode.TextEditorDecorationType | null,
    horizontalRuleDecoration: null as vscode.TextEditorDecorationType | null,
    markerConcealDecoration: null as vscode.TextEditorDecorationType | null,
    inlineBoldDecoration: null as vscode.TextEditorDecorationType | null,
    inlineItalicDecoration: null as vscode.TextEditorDecorationType | null,
    inlineStrikethroughDecoration: null as vscode.TextEditorDecorationType | null,
    inlineCodeContentDecoration: null as vscode.TextEditorDecorationType | null,
    imageInlineDecoration: null as vscode.TextEditorDecorationType | null,
    tableWrapInlineDecoration: null as vscode.TextEditorDecorationType | null,
    languageDecorations: new Map<string, Map<string, vscode.TextEditorDecorationType>>(),
    currentEditingLine: -1
};
