/**
 * 実 VS Code 拡張ホストテスト（test/extension/）の共通ヘルパー。
 * raw.test.ts / preview.test.ts から使う。
 */
import assert from "assert";
import * as vscode from "vscode";

/** untitled の markdown 文書を作ってアクティブに表示する。 */
export async function createTestDocument(content) {
    const doc = await vscode.workspace.openTextDocument({
        content: content,
        language: 'markdown'
    });
    return await vscode.window.showTextDocument(doc);
}

export async function closeAllEditors() {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
}

export async function updateMarkdownInlineSetting(key, value) {
    await vscode.workspace.getConfiguration('markdownInline').update(
        key,
        value,
        vscode.ConfigurationTarget.Global
    );
    await new Promise(resolve => setTimeout(resolve, 250));
}

export function assertSelection(editor, startLine, startCharacter, endLine, endCharacter, message) {
    assert.strictEqual(editor.selection.start.line, startLine, `${message}: start line`);
    assert.strictEqual(editor.selection.start.character, startCharacter, `${message}: start character`);
    assert.strictEqual(editor.selection.end.line, endLine, `${message}: end line`);
    assert.strictEqual(editor.selection.end.character, endCharacter, `${message}: end character`);
}
