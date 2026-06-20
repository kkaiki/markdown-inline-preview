/**
 * コマンド登録モジュール
 * 全てのコマンドハンドラを統合して登録
 */

import * as vscode from 'vscode';
import type { CommandHandlers, DebugLogFunction } from '../../types';

// コマンドハンドラのインポート
import * as listCommands from './list';
import * as tableCommands from './table';
import * as navigationCommands from './navigation';

/**
 * デバッグログ出力（外部から注入）
 */
let debugLog: DebugLogFunction = () => {};

/**
 * デバッグログ関数を設定
 */
export function setDebugLog(logFn: DebugLogFunction): void {
    debugLog = logFn;
    listCommands.setDebugLog(logFn);
    tableCommands.setDebugLog(logFn);
    navigationCommands.setDebugLog(logFn);
}

/**
 * 安全にコマンドを登録するヘルパー
 */
function safeRegister(
    context: vscode.ExtensionContext,
    commandId: string,
    handler: () => void | Promise<void>,
    conflicts: string[]
): void {
    try {
        const disposable = vscode.commands.registerCommand(commandId, handler);
        context.subscriptions.push(disposable);
    } catch (error) {
        const err = error as Error;
        const message = err && typeof err.message === 'string' ? err.message : '';
        if (message.includes(`command '${commandId}' already exists`)) {
            conflicts.push(commandId);
            debugLog(`[WARN] Command "${commandId}" already exists. Skipping registration.`);
        } else {
            throw error;
        }
    }
}

/**
 * 全コマンドを登録
 */
export function registerCommands(context: vscode.ExtensionContext, handlers: CommandHandlers): void {
    debugLog('Registering all commands...');
    const conflicts: string[] = [];

    // リスト操作コマンド
    safeRegister(context, 'markdownInline.smartEnter',
        listCommands.createSmartEnterHandler(handlers), conflicts);

    safeRegister(context, 'markdownInline.renumberLists',
        listCommands.createRenumberHandler(handlers), conflicts);

    safeRegister(context, 'markdownInline.convertToBullet',
        listCommands.createConvertHandler(handlers, 'bullet'), conflicts);

    safeRegister(context, 'markdownInline.convertToNumbered',
        listCommands.createConvertHandler(handlers, 'numbered'), conflicts);

    safeRegister(context, 'markdownInline.convertToCheckbox',
        listCommands.createConvertHandler(handlers, 'checkbox'), conflicts);

    safeRegister(context, 'markdownInline.convertToNormal',
        listCommands.createConvertHandler(handlers, 'normal'), conflicts);

    safeRegister(context, 'markdownInline.toggleCheckbox',
        listCommands.createToggleCheckboxHandler(handlers), conflicts);

    safeRegister(context, 'markdownInline.clickCheckbox',
        listCommands.createClickCheckboxHandler(handlers), conflicts);

    safeRegister(context, 'markdownInline.toggleCheckboxAtLine',
        listCommands.createToggleCheckboxAtLineHandler(handlers), conflicts);

    safeRegister(context, 'markdownInline.increaseIndent',
        listCommands.createIndentHandler(handlers, true), conflicts);

    safeRegister(context, 'markdownInline.decreaseIndent',
        listCommands.createIndentHandler(handlers, false), conflicts);

    // テーブル操作コマンド
    safeRegister(context, 'markdownInline.formatTable',
        tableCommands.createFormatTableHandler(handlers), conflicts);

    safeRegister(context, 'markdownInline.tableNavigateRight',
        tableCommands.createTableNavigateHandler(handlers, 'right'), conflicts);

    safeRegister(context, 'markdownInline.tableNavigateLeft',
        tableCommands.createTableNavigateHandler(handlers, 'left'), conflicts);

    // ナビゲーションコマンド
    safeRegister(context, 'markdownInline.smartMoveLeft',
        navigationCommands.createSmartMoveLeftHandler(handlers), conflicts);

    safeRegister(context, 'markdownInline.smartMoveRight',
        navigationCommands.createSmartMoveRightHandler(handlers), conflicts);

    safeRegister(context, 'markdownInline.smartMoveUp',
        navigationCommands.createSmartMoveUpHandler(handlers), conflicts);

    safeRegister(context, 'markdownInline.smartMoveDown',
        navigationCommands.createSmartMoveDownHandler(handlers), conflicts);

    safeRegister(context, 'markdownInline.smartSelectLeft',
        navigationCommands.createSmartSelectLeftHandler(handlers), conflicts);

    safeRegister(context, 'markdownInline.smartSelectAll',
        navigationCommands.createSmartSelectAllHandler(handlers), conflicts);

    safeRegister(context, 'markdownInline.moveLineUp',
        navigationCommands.createMoveLineHandler(handlers, 'up'), conflicts);

    safeRegister(context, 'markdownInline.moveLineDown',
        navigationCommands.createMoveLineHandler(handlers, 'down'), conflicts);

    // 競合警告
    if (conflicts.length > 0) {
        const conflictMessage = `Markdown Inline Preview: Some commands could not be registered (${conflicts.join(', ')}).`;
        debugLog(`[WARN] ${conflictMessage}`);
        vscode.window.showWarningMessage(conflictMessage);
    }

    debugLog(`All commands registered successfully${conflicts.length ? ' (with conflicts skipped)' : ''}`);
}
