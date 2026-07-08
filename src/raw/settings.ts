import * as vscode from 'vscode';

import {
    debugLog,
    rawRuntime,
    resolveAlwaysOpenNewTab,
    resolveAutoTableFormattingEnabled,
    resolveCheckboxMouseToggleEnabled,
    resolveCodeBlockAutoCompleteEnabled,
    resolveCodeBlockDecorationsEnabled,
    resolveDefaultWordWrap,
    resolveDisableCompetingMarkdownFeatures,
    resolveHeadingDecorationsEnabled,
    resolveHorizontalRuleDecorationsEnabled,
    resolveImageHoverPreviewEnabled,
    resolveImageThumbnailEnabled,
    resolvePreviewEnabled,
    resolveShowCheckboxCodeLensEnabled,
    resolveTableWrapHoverEnabled,
    resolveTableWrapMaxWidth,
    resolveWrapTabs
} from '../core';
import {
    rebuildHeadingDecorations as rebuildHeadingDecorationTypes,
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

export function isAlwaysOpenNewTabEnabled(): boolean {
    return resolveAlwaysOpenNewTab(getMarkdownInlineConfig());
}

export function isDefaultWordWrapEnabled(): boolean {
    return resolveDefaultWordWrap(getMarkdownInlineConfig());
}

export function isWrapTabsEnabled(): boolean {
    return resolveWrapTabs(getMarkdownInlineConfig());
}

// markdownInline.preview.alwaysOpenNewTab は VS Code 本体の workbench.editor.enablePreview
// （シングルクリックで開いたタブが次のファイルで上書きされる「プレビュータブ」機能）を
// 直接書き換える。VS Code 側に言語別スコープが無いグローバル設定のため、Markdown 以外の
// ファイルにも影響する（applyMarkdownSettings と同じ「本体設定を直接操作する」方針）。
export function applyAlwaysOpenNewTabSetting(): void {
    const enabled = isAlwaysOpenNewTabEnabled();
    vscode.workspace.getConfiguration().update(
        'workbench.editor.enablePreview',
        !enabled,
        vscode.ConfigurationTarget.Global
    );
    debugLog(`Applied workbench.editor.enablePreview=${!enabled} (markdownInline.preview.alwaysOpenNewTab=${enabled})`);
}

// markdownInline.preview.wordWrap は VS Code 本体の editor.wordWrap を Markdown 言語限定
// （[markdown] オーバーライド）で書き換える。editor.wordWrap は言語別スコープに対応しているため、
// 他言語のファイルには影響しない。
export function applyDefaultWordWrapSetting(): void {
    const enabled = isDefaultWordWrapEnabled();
    vscode.workspace.getConfiguration('editor', { languageId: 'markdown' }).update(
        'wordWrap',
        enabled ? 'on' : 'off',
        vscode.ConfigurationTarget.Global,
        true
    );
    debugLog(`Applied [markdown].editor.wordWrap=${enabled ? 'on' : 'off'} (markdownInline.preview.wordWrap=${enabled})`);
}

// markdownInline.preview.wrapTabs は VS Code 本体の workbench.editor.wrapTabs
// （タブが多いときに横スクロールせず複数行に折り返す機能）を直接書き換える。
// alwaysOpenNewTab と同様、VS Code 側に言語別スコープが無いグローバル設定のため、
// Markdown 以外のファイルにも影響する。
export function applyWrapTabsSetting(): void {
    const enabled = isWrapTabsEnabled();
    vscode.workspace.getConfiguration().update(
        'workbench.editor.wrapTabs',
        enabled,
        vscode.ConfigurationTarget.Global
    );
    debugLog(`Applied workbench.editor.wrapTabs=${enabled} (markdownInline.preview.wrapTabs=${enabled})`);
}
