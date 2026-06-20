import * as vscode from 'vscode';

import {
    debugLog,
    rawRuntime,
    resolveAutoTableFormattingEnabled,
    resolveCheckboxMouseToggleEnabled,
    resolveCodeBlockAutoCompleteEnabled,
    resolveCodeBlockDecorationsEnabled,
    resolveDisableCompetingMarkdownFeatures,
    resolveHeadingDecorationsEnabled,
    resolveHideStrikethroughOnEditingLine,
    resolveHorizontalRuleDecorationsEnabled,
    resolveImageHoverPreviewEnabled,
    resolveImageThumbnailEnabled,
    resolvePreviewEnabled,
    resolveShowCheckboxCodeLensEnabled,
    resolveTableWrapHoverEnabled,
    resolveTableWrapMaxWidth
} from '../core';
import {
    rebuildHeadingDecorations as rebuildHeadingDecorationTypes,
    rawDecorationState,
    updateAllDecorations
} from './decorations';

export function getMarkdownInlineConfig(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration('markdownInline');
}

export function isPreviewEnabled(): boolean {
    return resolvePreviewEnabled(getMarkdownInlineConfig());
}

export function isAutoTableFormattingEnabled(): boolean {
    return resolveAutoTableFormattingEnabled(
        getMarkdownInlineConfig(),
        rawRuntime.slashTableNormalizeOverride
    );
}

export function isCheckboxMouseToggleEnabled(): boolean {
    return resolveCheckboxMouseToggleEnabled(getMarkdownInlineConfig());
}

export function isCodeBlockAutoCompleteEnabled(): boolean {
    return resolveCodeBlockAutoCompleteEnabled(getMarkdownInlineConfig());
}

export function isHeadingDecorationsEnabled(): boolean {
    return resolveHeadingDecorationsEnabled(getMarkdownInlineConfig());
}

export function isCodeBlockDecorationsEnabled(): boolean {
    return resolveCodeBlockDecorationsEnabled(getMarkdownInlineConfig());
}

export function isHorizontalRuleDecorationsEnabled(): boolean {
    return resolveHorizontalRuleDecorationsEnabled(getMarkdownInlineConfig());
}

export function shouldDisableCompetingMarkdownFeatures(): boolean {
    return resolveDisableCompetingMarkdownFeatures(getMarkdownInlineConfig());
}

export function shouldHideStrikethroughOnEditingLine(line: number): boolean {
    return resolveHideStrikethroughOnEditingLine(
        getMarkdownInlineConfig(),
        line,
        rawDecorationState.currentEditingLine
    );
}

export function isShowCheckboxCodeLensEnabled(): boolean {
    return resolveShowCheckboxCodeLensEnabled(getMarkdownInlineConfig());
}

export function isImageHoverPreviewEnabled(): boolean {
    return resolveImageHoverPreviewEnabled(getMarkdownInlineConfig());
}

export function isTableWrapHoverEnabled(): boolean {
    return resolveTableWrapHoverEnabled(getMarkdownInlineConfig());
}

export function isImageThumbnailEnabled(): boolean {
    return resolveImageThumbnailEnabled(getMarkdownInlineConfig());
}

export function getTableWrapMaxWidth(): number {
    return resolveTableWrapMaxWidth(getMarkdownInlineConfig());
}

export function rebuildHeadingDecorations(): void {
    rebuildHeadingDecorationTypes(getMarkdownInlineConfig());
    const editor = vscode.window.activeTextEditor;
    if (editor && editor.document.languageId === 'markdown') {
        updateAllDecorations(editor);
    }
}

export function applyMarkdownSettings(): void {
    const config = vscode.workspace.getConfiguration();
    config.update('markdown.extension.completion.enabled', false, vscode.ConfigurationTarget.Workspace);
    config.update('markdown.extension.tableFormatter.enabled', false, vscode.ConfigurationTarget.Workspace);
    debugLog('Disabled competing Markdown extension features (completion/tableFormatter)');
}
