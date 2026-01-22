/**
 * コマンド登録モジュール
 * 全てのコマンドハンドラを統合して登録
 */
import * as vscode from 'vscode';
import type { CommandHandlers, DebugLogFunction } from '../types';
/**
 * デバッグログ関数を設定
 */
export declare function setDebugLog(logFn: DebugLogFunction): void;
/**
 * 全コマンドを登録
 */
export declare function registerCommands(context: vscode.ExtensionContext, handlers: CommandHandlers): void;
