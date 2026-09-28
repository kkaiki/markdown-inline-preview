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
import * as liveModule from '../live/activate';
import { registerLicenseCommands } from '../license/licenseCommands';
import { registerCheckboxCodeLensProvider } from './providers/checkboxCodeLens';
import { showWhatsNewIfUpdated } from './whatsNew';
import { registerImageHoverProvider } from './providers/imageHover';
import { registerTableWrapHoverProvider } from './providers/tableWrapHover';
import { registerSpreadsheetPasteProvider } from './providers/spreadsheetPaste';
import {
    applyAlwaysOpenNewTabSetting,
    applyDefaultWordWrapSetting,
    applyWrapTabsSetting,
    applyMarkdownSettings,
    applyNotionKeymapContext,
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
    applyNotionKeymapContext();

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

    liveModule.activateLiveFeature(context);

    // PDF のクレジット行除去（買い切り）。購入・キー入力・復元と deep link の受け口。
    // Live 側より後に登録するのは、PDF 書き出しがこのストアを読むため。
    const licenseStore = registerLicenseCommands(context);
    liveModule.setLicenseStore(licenseStore, context.globalState);

    registerCheckboxCodeLensProvider(context, () => isShowCheckboxCodeLensEnabled());
    registerImageHoverProvider(context, () => isImageHoverPreviewEnabled());
    registerTableWrapHoverProvider(
        context,
        () => isTableWrapHoverEnabled(),
        () => getTableWrapMaxWidth()
    );

    // Excel・スプレッドシートの範囲を貼ったら Markdown の表にする（無料・既定）
    registerSpreadsheetPasteProvider(context);

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
        applyWrapTabsSetting,
        applyNotionKeymapContext
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

    showWhatsNewIfUpdated(context, licenseStore);

    debugLog('=== Extension activation completed successfully ===');
}

export function deactivate(): void {
    disposeRawDecorations();
    clearRuntimeTimers();
}
