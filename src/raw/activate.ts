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
import * as liveModule from '../live/activate';
import { registerCheckboxCodeLensProvider } from './providers/checkboxCodeLens';
import { registerPreviewToggleCodeLensProvider } from './providers/previewToggleCodeLens';
import { registerPreviewToggleLineWidget } from './providers/previewToggleLineWidget';
import { showWhatsNewIfUpdated } from './whatsNew';
import { registerImageHoverProvider } from './providers/imageHover';
import { registerTableWrapHoverProvider } from './providers/tableWrapHover';
import {
    applyAlwaysOpenNewTabSetting,
    applyDefaultWordWrapSetting,
    applyWrapTabsSetting,
    applyMarkdownSettings,
    getMarkdownInlineConfig,
    isAutoTableFormattingEnabled,
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
    shouldDisableCompetingMarkdownFeatures
} from './settings';
import {
    formatTableAtLine,
    getAllTableCells,
    getTableCellInfo
} from './table';

export function activate(context: vscode.ExtensionContext): void {
    rawRuntime.debugChannel = vscode.window.createOutputChannel('Markdown Inline Preview');
    debugLog('=== Markdown Inline Preview Extension Activated ===');

    if (shouldDisableCompetingMarkdownFeatures()) {
        applyMarkdownSettings();
    }

    applyAlwaysOpenNewTabSetting();
    applyDefaultWordWrapSetting();
    applyWrapTabsSetting();

    setRawDecorationDeps({
        isPreviewEnabled,
        isHeadingDecorationsEnabled,
        isCodeBlockDecorationsEnabled,
        isHorizontalRuleDecorationsEnabled,
        isImageThumbnailEnabled,
        isTableWrapHoverEnabled,
        getTableWrapMaxWidth: () => getTableWrapMaxWidth(),
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
        moveLineWithHierarchy
    });

    previewModule.setDebugLog(debugLog);
    previewModule.activatePreviewFeature(context);
    liveModule.activateLiveFeature(context);

    registerCheckboxCodeLensProvider(context, () => isPreviewEnabled() && isShowCheckboxCodeLensEnabled());
    registerPreviewToggleCodeLensProvider(
        context,
        () => getMarkdownInlineConfig().get<boolean>('preview.showToggleCodeLens', false)
    );
    registerPreviewToggleLineWidget(
        context,
        () => getMarkdownInlineConfig().get<boolean>('preview.showToggleLineWidget', true)
    );
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
        isAutoTableFormattingEnabled,
        formatTableAtLine,
        isCheckboxMouseToggleEnabled,
        shouldDisableCompetingMarkdownFeatures,
        applyMarkdownSettings,
        rebuildHeadingDecorations,
        applyAlwaysOpenNewTabSetting,
        applyDefaultWordWrapSetting,
        applyWrapTabsSetting
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

    showWhatsNewIfUpdated(context);

    debugLog('=== Extension activation completed successfully ===');
}

export function deactivate(): void {
    disposeRawDecorations();
    clearRuntimeTimers();
}
