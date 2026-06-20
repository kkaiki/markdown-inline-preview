import * as vscode from 'vscode';

import { createHeadingDecorations, resolveHeadingColorScheme } from './headingSchemes';
import { rawDecorationState } from './state';

export function createRawDecorations(config: vscode.WorkspaceConfiguration): void {
    rawDecorationState.checkedDecoration = vscode.window.createTextEditorDecorationType({
        textDecoration: 'line-through !important',
        color: 'rgba(136, 136, 136, 0.6)',
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
    });

    rawDecorationState.headingDecorations = createHeadingDecorations(resolveHeadingColorScheme(config));

    rawDecorationState.codeBlockDecoration = vscode.window.createTextEditorDecorationType({
        isWholeLine: true,
        light: { backgroundColor: 'rgba(0, 0, 0, 0.05)' },
        dark: { backgroundColor: 'rgba(40, 44, 52, 0.85)' },
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
    });

    rawDecorationState.horizontalRuleDecoration = vscode.window.createTextEditorDecorationType({
        isWholeLine: true,
        borderWidth: '0 0 2px 0',
        borderStyle: 'solid',
        light: { borderColor: 'rgba(0, 0, 0, 0.35)' },
        dark: { borderColor: 'rgba(255, 255, 255, 0.28)' },
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
    });

    rawDecorationState.markerConcealDecoration = vscode.window.createTextEditorDecorationType({
        textDecoration: 'none; display: none;'
    });

    rawDecorationState.inlineBoldDecoration = vscode.window.createTextEditorDecorationType({
        fontWeight: '700',
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
    });

    rawDecorationState.inlineItalicDecoration = vscode.window.createTextEditorDecorationType({
        fontStyle: 'italic',
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
    });

    rawDecorationState.inlineStrikethroughDecoration = vscode.window.createTextEditorDecorationType({
        textDecoration: 'line-through',
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
    });

    rawDecorationState.inlineCodeContentDecoration = vscode.window.createTextEditorDecorationType({
        borderRadius: '3px',
        light: { backgroundColor: 'rgba(0, 0, 0, 0.06)' },
        dark: { backgroundColor: 'rgba(255, 255, 255, 0.08)' },
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
    });

    rawDecorationState.imageInlineDecoration = vscode.window.createTextEditorDecorationType({});
    rawDecorationState.tableWrapInlineDecoration = vscode.window.createTextEditorDecorationType({});
}

export function rebuildHeadingDecorations(config: vscode.WorkspaceConfiguration): void {
    if (rawDecorationState.headingDecorations.length) {
        rawDecorationState.headingDecorations.forEach(d => d.dispose());
    }
    rawDecorationState.headingDecorations = createHeadingDecorations(resolveHeadingColorScheme(config));
}

export function disposeRawDecorations(): void {
    const s = rawDecorationState;
    s.checkedDecoration?.dispose();
    s.checkedDecoration = null;
    s.headingDecorations.forEach(d => d.dispose());
    s.headingDecorations = [];
    s.codeBlockDecoration?.dispose();
    s.codeBlockDecoration = null;
    s.horizontalRuleDecoration?.dispose();
    s.horizontalRuleDecoration = null;
    s.markerConcealDecoration?.dispose();
    s.markerConcealDecoration = null;
    s.inlineBoldDecoration?.dispose();
    s.inlineBoldDecoration = null;
    s.inlineItalicDecoration?.dispose();
    s.inlineItalicDecoration = null;
    s.inlineStrikethroughDecoration?.dispose();
    s.inlineStrikethroughDecoration = null;
    s.inlineCodeContentDecoration?.dispose();
    s.inlineCodeContentDecoration = null;
    s.imageInlineDecoration?.dispose();
    s.imageInlineDecoration = null;
    s.tableWrapInlineDecoration?.dispose();
    s.tableWrapInlineDecoration = null;
    for (const decorations of s.languageDecorations.values()) {
        for (const decoration of decorations.values()) {
            decoration.dispose();
        }
    }
    s.languageDecorations.clear();
}
