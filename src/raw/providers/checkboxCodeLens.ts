import * as vscode from 'vscode';

export function registerCheckboxCodeLensProvider(
    context: vscode.ExtensionContext,
    isEnabled: () => boolean
): vscode.Disposable {
    const emitter = new vscode.EventEmitter<void>();

    const provider: vscode.CodeLensProvider = {
        onDidChangeCodeLenses: emitter.event,
        provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
            if (!isEnabled() || document.languageId !== 'markdown') return [];

            const lenses: vscode.CodeLens[] = [];
            for (let i = 0; i < document.lineCount; i++) {
                const lineText = document.lineAt(i).text;
                const match = lineText.match(/^(\s*)-\s\[([\sxX]?)\]/);
                if (!match) continue;

                const isChecked = match[2].toLowerCase() === 'x';
                const range = new vscode.Range(i, 0, i, lineText.length);
                lenses.push(
                    new vscode.CodeLens(range, {
                        title: isChecked ? '$(check) Uncheck' : '$(circle-outline) Check',
                        command: 'markdownInline.toggleCheckboxAtLine',
                        arguments: [i]
                    })
                );
            }
            return lenses;
        }
    };

    const registration = vscode.languages.registerCodeLensProvider({ language: 'markdown' }, provider);

    const refresh = (): void => {
        if (isEnabled()) emitter.fire();
    };

    context.subscriptions.push(
        registration,
        vscode.workspace.onDidChangeTextDocument(event => {
            if (event.document.languageId === 'markdown') refresh();
        }),
        vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration('markdownInline.showCheckboxCodeLens')) refresh();
        })
    );

    return registration;
}
