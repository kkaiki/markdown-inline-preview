/**
 * 実 VS Code 拡張ホストテスト（test/extension/）の共通ヘルパー。
 * raw.test.ts / preview.test.ts から使う。
 */
import assert from "assert";
import * as fs from "fs";
import * as vscode from "vscode";

/** untitled の markdown 文書を作ってアクティブに表示する。 */
export async function createTestDocument(content) {
    const doc = await vscode.workspace.openTextDocument({
        content: content,
        language: 'markdown'
    });
    return await vscode.window.showTextDocument(doc);
}

/**
 * 文書の内容を改行 \n にそろえて返す。Windows の既定（files.eol = auto）では新規文書が CRLF になり、
 * VS Code は挿入した \n も CRLF に直すので、期待値を \n で書いたテストが Windows だけ落ちていた（2026-09-30）。
 */
export function textLF(document: vscode.TextDocument): string {
    return document.getText().replace(/\r\n/g, '\n');
}

/** 条件が満たされるまで待つ（固定の sleep は遅い環境で落ちるため）。満たされなくても timeoutMs で戻る */
export async function waitFor(condition: () => boolean, timeoutMs = 3000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!condition() && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 50));
    }
}

/**
 * テストの一時フォルダを消す。Windows は開いているファイル（VS Code が保存直後の文書を掴んでいる等）が
 * あるとフォルダを消せず EPERM になるので、少し待って再試行し、それでも消せなければあきらめる
 * （後始末の失敗でテストを落とさない。2026-09-30 に Windows の CI で 36.4 が落ちた）。
 */
export function removeTempDir(dir: string): void {
    try {
        fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    } catch {
        // 一時フォルダなので OS に任せる
    }
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
