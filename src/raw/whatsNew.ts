import * as vscode from 'vscode';

/**
 * 更新時に「What's New」通知を出す。
 *
 * VS Code/Cursor は拡張を自動・無音で更新するため、新機能はユーザーに気づかれにくい。
 * 起動時に前回起動時のバージョン（globalState）と現バージョンを比べ、上がっていれば
 * 1 度だけ通知し、CHANGELOG / Walkthrough へ誘導する。
 */
const LAST_VERSION_KEY = 'ipreview.lastVersion';

function parseVersion(v: string): number[] {
    return v.split('.').map(n => parseInt(n, 10) || 0);
}

/** a < b なら true（セマンティックな数値比較。プレリリース表記は無視）。 */
function isOlder(a: string, b: string): boolean {
    const pa = parseVersion(a);
    const pb = parseVersion(b);
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i++) {
        const x = pa[i] ?? 0;
        const y = pb[i] ?? 0;
        if (x !== y) return x < y;
    }
    return false;
}

export function showWhatsNewIfUpdated(context: vscode.ExtensionContext): void {
    const current = String(context.extension.packageJSON.version ?? '');
    if (!current) return;

    const previous = context.globalState.get<string>(LAST_VERSION_KEY);
    // 現バージョンを記録（次回比較用）。通知を出す/出さないに関わらず更新する。
    void context.globalState.update(LAST_VERSION_KEY, current);

    // 初回インストール（previous 無し）は通知しない（うるさいだけ）。
    if (!previous) return;
    if (!isOlder(previous, current)) return;

    const changelog = 'リリースノート';
    const walkthrough = '使い方ガイド';
    void vscode.window
        .showInformationMessage(
            `iPreview が v${current} に更新されました。新機能・変更点をご確認ください。`,
            changelog,
            walkthrough
        )
        .then(choice => {
            if (choice === changelog) {
                openChangelog(context);
            } else if (choice === walkthrough) {
                void vscode.commands.executeCommand(
                    'workbench.action.openWalkthrough',
                    `${context.extension.id}#ipreview.gettingStarted`,
                    false
                );
            }
        });
}

function openChangelog(context: vscode.ExtensionContext): void {
    const uri = vscode.Uri.joinPath(context.extensionUri, 'CHANGELOG.md');
    // Markdown のプレビューで開く（読みやすさ優先）。失敗時は通常のエディタで開く。
    void vscode.commands.executeCommand('markdown.showPreview', uri).then(undefined, () => {
        void vscode.window.showTextDocument(uri);
    });
}
