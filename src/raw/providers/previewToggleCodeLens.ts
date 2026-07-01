import * as vscode from 'vscode';

// 本文の一行目の上に「Preview / Raw 切り替え」ボタンを CodeLens として表示する。
// Cursor ではタイトルバーのアイコンが「…」へ折り畳まれて見えなくなるため、
// 本文の先頭に常時見えるトグルを置いて切り替えを分かりやすくする。
export function registerPreviewToggleCodeLensProvider(
    context: vscode.ExtensionContext,
    isEnabled: () => boolean
): vscode.Disposable {
    const emitter = new vscode.EventEmitter<void>();

    const provider: vscode.CodeLensProvider = {
        onDidChangeCodeLenses: emitter.event,
        provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
            if (!isEnabled() || document.languageId !== 'markdown') return [];

            // 0 行目に置くと VSCode/Cursor は一行目の「上」に描画する。
            const range = new vscode.Range(0, 0, 0, 0);
            return [
                new vscode.CodeLens(range, {
                    title: '$(book) Preview',
                    tooltip: 'Preview（WYSIWYG）で開く  ·  Cmd/Ctrl+Shift+.',
                    command: 'markdownInline.openPreview'
                }),
                new vscode.CodeLens(range, {
                    // Raw 側は現在地なので無効化したラベルとして見せる。
                    title: '$(code) Raw',
                    tooltip: '現在 Raw（Markdown ソース）モードです',
                    command: ''
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
            if (event.affectsConfiguration('markdownInline.preview.showToggleCodeLens')) refresh();
        })
    );

    return registration;
}
