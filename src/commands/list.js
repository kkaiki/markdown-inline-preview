"use strict";
/**
 * リスト操作コマンドハンドラ
 * smartEnter, renumberLists, convertTo*, indent, toggleCheckbox
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
exports.createSmartEnterHandler = createSmartEnterHandler;
exports.createRenumberHandler = createRenumberHandler;
exports.createConvertHandler = createConvertHandler;
exports.createToggleCheckboxHandler = createToggleCheckboxHandler;
exports.createIndentHandler = createIndentHandler;
const vscode = __importStar(require("vscode"));
let debugLog = () => { };
function setDebugLog(logFn) {
    debugLog = logFn;
}
/**
 * スマートEnterコマンドハンドラを作成
 */
function createSmartEnterHandler(handlers) {
    return async () => {
        debugLog('[COMMAND] smartEnter triggered');
        try {
            await handlers.smartEnterCommand();
        }
        catch (e) {
            const error = e;
            debugLog(`[ERROR] smartEnter failed: ${error.message || e}`);
            console.error('[smartEnter] Error:', e);
            // 失敗時は通常の改行にフォールバック
            await vscode.commands.executeCommand('type', { text: '\n' });
        }
    };
}
/**
 * 番号リスト再整形コマンドハンドラを作成
 */
function createRenumberHandler(handlers) {
    return () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor)
            return;
        handlers.renumberLists(editor);
    };
}
/**
 * リストタイプ変換コマンドハンドラを作成
 */
function createConvertHandler(handlers, targetType) {
    return () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor)
            return;
        handlers.convertLineToType(editor, targetType);
    };
}
/**
 * チェックボックストグルコマンドハンドラを作成
 */
function createToggleCheckboxHandler(handlers) {
    return () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor)
            return;
        handlers.toggleCheckbox(editor, editor.selection.active.line);
    };
}
/**
 * インデント調整コマンドハンドラを作成
 */
function createIndentHandler(handlers, increase) {
    return () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor)
            return;
        handlers.adjustIndent(editor, increase);
    };
}
//# sourceMappingURL=list.js.map