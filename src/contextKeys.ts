/**
 * 拡張が立てるコンテキストキー（メニューやコマンドの `when` 句が見るフラグ）を、立てた値ごと記録する。
 *
 * VS Code にはコンテキストキーの値を拡張から読む API が無いので、テストは `activate()` の戻り値
 * （`extension.exports.contextKeys()`）から読む。2026-10-01、`markdownInline.proPlusOnSale` を立てる行が
 * 誤って「ライセンスキーを入力」コマンドの中に入り、PRO+ のメニューが出なかった不具合を、起動時の値で検出するため
 * （docs/specifications/fixes/pro-plus-context-key.md）。
 */
import * as vscode from 'vscode';

const applied = new Map<string, unknown>();

export function setContextKey(key: string, value: unknown): Thenable<unknown> {
    applied.set(key, value);
    return vscode.commands.executeCommand('setContext', key, value);
}

/** これまでに立てたコンテキストキーと値 */
export function appliedContextKeys(): Record<string, unknown> {
    return Object.fromEntries(applied);
}
