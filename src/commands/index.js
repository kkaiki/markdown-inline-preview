"use strict";
/**
 * コマンド登録モジュール
 * 全てのコマンドハンドラを統合して登録
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.setDebugLog = setDebugLog;
exports.registerCommands = registerCommands;
const vscode = __importStar(require("vscode"));
// コマンドハンドラのインポート
const listCommands = __importStar(require("./list"));
const tableCommands = __importStar(require("./table"));
const navigationCommands = __importStar(require("./navigation"));
const tocCommands = __importStar(require("./toc"));
/**
 * デバッグログ出力（外部から注入）
 */
let debugLog = () => { };
/**
 * デバッグログ関数を設定
 */
function setDebugLog(logFn) {
    debugLog = logFn;
    listCommands.setDebugLog(logFn);
    tableCommands.setDebugLog(logFn);
    navigationCommands.setDebugLog(logFn);
    tocCommands.setDebugLog(logFn);
}
/**
 * 安全にコマンドを登録するヘルパー
 */
function safeRegister(context, commandId, handler, conflicts) {
    try {
        const disposable = vscode.commands.registerCommand(commandId, handler);
        context.subscriptions.push(disposable);
    }
    catch (error) {
        const err = error;
        const message = err && typeof err.message === 'string' ? err.message : '';
        if (message.includes(`command '${commandId}' already exists`)) {
            conflicts.push(commandId);
            debugLog(`[WARN] Command "${commandId}" already exists. Skipping registration.`);
        }
        else {
            throw error;
        }
    }
}
/**
 * 全コマンドを登録
 */
function registerCommands(context, handlers) {
    debugLog('Registering all commands...');
    const conflicts = [];
    // リスト操作コマンド
    safeRegister(context, 'markdownInline.smartEnter', listCommands.createSmartEnterHandler(handlers), conflicts);
    safeRegister(context, 'markdownInline.renumberLists', listCommands.createRenumberHandler(handlers), conflicts);
    safeRegister(context, 'markdownInline.convertToBullet', listCommands.createConvertHandler(handlers, 'bullet'), conflicts);
    safeRegister(context, 'markdownInline.convertToNumbered', listCommands.createConvertHandler(handlers, 'numbered'), conflicts);
    safeRegister(context, 'markdownInline.convertToCheckbox', listCommands.createConvertHandler(handlers, 'checkbox'), conflicts);
    safeRegister(context, 'markdownInline.convertToNormal', listCommands.createConvertHandler(handlers, 'normal'), conflicts);
    safeRegister(context, 'markdownInline.toggleCheckbox', listCommands.createToggleCheckboxHandler(handlers), conflicts);
    safeRegister(context, 'markdownInline.clickCheckbox', listCommands.createClickCheckboxHandler(handlers), conflicts);
    safeRegister(context, 'markdownInline.toggleCheckboxAtLine', listCommands.createToggleCheckboxAtLineHandler(handlers), conflicts);
    safeRegister(context, 'markdownInline.increaseIndent', listCommands.createIndentHandler(handlers, true), conflicts);
    safeRegister(context, 'markdownInline.decreaseIndent', listCommands.createIndentHandler(handlers, false), conflicts);
    // テーブル操作コマンド
    safeRegister(context, 'markdownInline.formatTable', tableCommands.createFormatTableHandler(handlers), conflicts);
    safeRegister(context, 'markdownInline.tableNavigateRight', tableCommands.createTableNavigateHandler(handlers, 'right'), conflicts);
    safeRegister(context, 'markdownInline.tableNavigateLeft', tableCommands.createTableNavigateHandler(handlers, 'left'), conflicts);
    // ナビゲーションコマンド
    safeRegister(context, 'markdownInline.smartMoveLeft', navigationCommands.createSmartMoveLeftHandler(handlers), conflicts);
    safeRegister(context, 'markdownInline.smartMoveRight', navigationCommands.createSmartMoveRightHandler(handlers), conflicts);
    safeRegister(context, 'markdownInline.smartMoveUp', navigationCommands.createSmartMoveUpHandler(handlers), conflicts);
    safeRegister(context, 'markdownInline.smartMoveDown', navigationCommands.createSmartMoveDownHandler(handlers), conflicts);
    safeRegister(context, 'markdownInline.smartSelectLeft', navigationCommands.createSmartSelectLeftHandler(handlers), conflicts);
    safeRegister(context, 'markdownInline.smartSelectAll', navigationCommands.createSmartSelectAllHandler(handlers), conflicts);
    safeRegister(context, 'markdownInline.moveLineUp', navigationCommands.createMoveLineHandler(handlers, 'up'), conflicts);
    safeRegister(context, 'markdownInline.moveLineDown', navigationCommands.createMoveLineHandler(handlers, 'down'), conflicts);
    // 目次コマンド
    safeRegister(context, 'markdownInline.updateTableOfContents', tocCommands.createUpdateTocHandler(handlers), conflicts);
    // 競合警告
    if (conflicts.length > 0) {
        const conflictMessage = `Markdown Inline Preview: Some commands could not be registered (${conflicts.join(', ')}).`;
        debugLog(`[WARN] ${conflictMessage}`);
        vscode.window.showWarningMessage(conflictMessage);
    }
    debugLog(`All commands registered successfully${conflicts.length ? ' (with conflicts skipped)' : ''}`);
}
//# sourceMappingURL=index.js.map