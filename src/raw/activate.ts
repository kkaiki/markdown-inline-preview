import * as vscode from 'vscode';

import { clearRuntimeTimers, debugLog, rawRuntime } from '../core';
import * as commandsModule from './commands';
import { registerSlashCommandCompletion } from './completion/slashCompletion';
import {
    createRawDecorations,
    disposeRawDecorations,
    setRawDecorationDeps,
    updateAllDecorations
} from './decorations';
import { registerRawListeners } from './handlers/registerRawListeners';
import {
    adjustIndent,
    convertLineToType,
    moveLineWithHierarchy,
    renumberLists,
    smartEnterCommand,
    toggleCheckbox
} from './list';
import * as previewModule from '../preview/activate';
import { registerCheckboxCodeLensProvider } from './providers/checkboxCodeLens';
import { registerImageHoverProvider } from './providers/imageHover';
import { registerTableWrapHoverProvider } from './providers/tableWrapHover';
import {
    applyMarkdownSettings,
    getMarkdownInlineConfig,
    isAutoTableFormattingEnabled,
    isAutoUpdateTocEnabled,
    isCheckboxMouseToggleEnabled,
    isCodeBlockAutoCompleteEnabled,
    isCodeBlockDecorationsEnabled,
    isHeadingDecorationsEnabled,
    isHorizontalRuleDecorationsEnabled,
    isImageHoverPreviewEnabled,
    isImageThumbnailEnabled,
    isPreviewEnabled,
    isShowCheckboxCodeLensEnabled,
    isTableWrapHoverEnabled,
    getTableWrapMaxWidth,
    rebuildHeadingDecorations,
    shouldDisableCompetingMarkdownFeatures,
    shouldHideStrikethroughOnEditingLine
} from './settings';
import {
    formatTableAtLine,
    getAllTableCells,
    getTableCellInfo
} from './table';
import { updateTableOfContents } from './toc';

export function activate(context: vscode.ExtensionContext): void {
    rawRuntime.debugChannel = vscode.window.createOutputChannel('Markdown Table Debug');
    debugLog('=== Markdown Inline Preview Extension Activated ===');

    if (shouldDisableCompetingMarkdownFeatures()) {
        applyMarkdownSettings();
    }

    setRawDecorationDeps({
        isPreviewEnabled,
        isHeadingDecorationsEnabled,
        isCodeBlockDecorationsEnabled,
        isHorizontalRuleDecorationsEnabled,
        isImageThumbnailEnabled,
        isTableWrapHoverEnabled,
        getTableWrapMaxWidth: () => getTableWrapMaxWidth(),
        shouldHideStrikethroughOnEditingLine,
        debugLog
    });
    createRawDecorations(getMarkdownInlineConfig());

    commandsModule.setDebugLog(debugLog);
    commandsModule.registerCommands(context, {
        smartEnterCommand,
        renumberLists,
        convertLineToType,
        toggleCheckbox,
        adjustIndent,
        formatTableAtLine,
        getTableCellInfo,
        getAllTableCells,
        moveLineWithHierarchy,
        updateTableOfContents
    });

    previewModule.setDebugLog(debugLog);
    previewModule.activatePreviewFeature(context);

    registerCheckboxCodeLensProvider(context, () => isPreviewEnabled() && isShowCheckboxCodeLensEnabled());
    registerImageHoverProvider(context, () => isImageHoverPreviewEnabled());
    registerTableWrapHoverProvider(
        context,
        () => isTableWrapHoverEnabled(),
        () => getTableWrapMaxWidth()
    );

    registerSlashCommandCompletion(context);

    registerRawListeners(context, {
        debugLog,
        isCodeBlockAutoCompleteEnabled,
        updateAllDecorations,
        isAutoUpdateTocEnabled,
        updateTableOfContents,
        isAutoTableFormattingEnabled,
        formatTableAtLine,
        isCheckboxMouseToggleEnabled,
        shouldDisableCompetingMarkdownFeatures,
        applyMarkdownSettings,
        rebuildHeadingDecorations
    });

    const editor = vscode.window.activeTextEditor;
    if (editor) {
        debugLog(`Active editor found: ${editor.document.fileName}, language: ${editor.document.languageId}`);
        if (editor.document.languageId === 'markdown') {
            debugLog('Applying initial decorations to markdown file');
            updateAllDecorations(editor);
        }
    } else {
        debugLog('No active editor found on activation');
    }

    debugLog('=== Extension activation completed successfully ===');
}

export function deactivate(): void {
    disposeRawDecorations();
    clearRuntimeTimers();
}
