import * as vscode from 'vscode';

/**
 * Raw（テキストエディタ）で「Preview / Raw 切り替え」ラベルを本文の一行目の "上" に出す。
 *
 * 以前は装飾（before 疑似要素 + display:block）で表示していたが、テキストエディタの装飾は
 * 行に縦方向の領域を確保できないため、display:block にしても一行目のテキストへ重なってしまう。
 * CodeLens は VS Code が「行の上」へ独立した 1 行として描画し、本文と重ならないため、
 * こちらで実装する。クリックでそのまま Preview に切り替わる。
 */
const LABEL = '$(book) Preview │ Raw';

export function registerPreviewToggleLineWidget(
    context: vscode.ExtensionContext,
    isEnabled: () => boolean
): vscode.Disposable {
    const emitter = new vscode.EventEmitter<void>();

    const provider: vscode.CodeLensProvider = {
        onDidChangeCodeLenses: emitter.event,
        provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
            if (!isEnabled() || document.languageId !== 'markdown') return [];

            // 0 行目に置くと VS Code / Cursor は一行目の「上」へ描画する（重ならない）。
            const range = new vscode.Range(0, 0, 0, 0);
            return [
                new vscode.CodeLens(range, {
                    title: LABEL,
                    tooltip: 'Preview（WYSIWYG）と Raw を切り替える  ·  Cmd/Ctrl+Shift+M',
                    command: 'markdownInline.togglePreview'
                })
            ];
        }
    };

    const registration = vscode.languages.registerCodeLensProvider({ language: 'markdown' }, provider);

    const refresh = (): void => emitter.fire();

    context.subscriptions.push(
        registration,
        emitter,
        vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration('markdownInline.preview.showToggleLineWidget')) refresh();
        })
    );

    return registration;
}
