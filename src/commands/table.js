"use strict";
/**
 * テーブル操作コマンドハンドラ
 * formatTable, tableNavigate*
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
exports.createFormatTableHandler = createFormatTableHandler;
exports.createTableNavigateHandler = createTableNavigateHandler;
const vscode = __importStar(require("vscode"));
let debugLog = () => { };
function setDebugLog(logFn) {
    debugLog = logFn;
}
/**
 * テーブル整形コマンドハンドラを作成
 */
function createFormatTableHandler(handlers) {
    return () => {
        debugLog('[COMMAND] Format Table command invoked');
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            debugLog('[COMMAND] No active editor');
            return;
        }
        const line = editor.selection.active.line;
        debugLog(`[COMMAND] Formatting table at line ${line}`);
        handlers.formatTableAtLine(editor, line);
    };
}
/**
 * テーブルナビゲーションコマンドハンドラを作成
 */
function createTableNavigateHandler(handlers, direction) {
    return () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor)
            return;
        const position = editor.selection.active;
        const lineText = editor.document.lineAt(position.line).text;
        const cellInfo = handlers.getTableCellInfo(lineText, position.character);
        if (!cellInfo || !cellInfo.isTable || cellInfo.cellIndex < 0) {
            // テーブル外: デフォルトのTab/Shift+Tab動作
            if (direction === 'right') {
                vscode.commands.executeCommand('tab');
            }
            else {
                vscode.commands.executeCommand('outdent');
            }
            return;
        }
        if (direction === 'right') {
            // Tab: 次のセルへ
            if (cellInfo.cellIndex < cellInfo.allCells.length - 1) {
                const nextCell = cellInfo.allCells[cellInfo.cellIndex + 1];
                const newPosition = new vscode.Position(position.line, nextCell.contentStart);
                editor.selection = new vscode.Selection(newPosition, newPosition);
            }
            // 最後のセルの場合は何もしない（または次の行へ移動する実装も可能）
        }
        else {
            // Shift+Tab: 前のセルへ
            if (cellInfo.cellIndex > 0) {
                const prevCell = cellInfo.allCells[cellInfo.cellIndex - 1];
                const newPosition = new vscode.Position(position.line, prevCell.contentStart);
                editor.selection = new vscode.Selection(newPosition, newPosition);
            }
            // 最初のセルの場合は何もしない
        }
    };
}
//# sourceMappingURL=table.js.map