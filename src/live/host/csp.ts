/**
 * Live webview の Content-Security-Policy 文字列組み立て。
 * `vscode` に依存しない純関数として切り出し、jsdom から直接テストできるようにしている
 * （host のプロバイダは `vscode` に依存するため jsdom から import できない）。
 */
export function buildPreviewCsp(cspSource: string, nonce: string): string {
    return [
        "default-src 'none'",
        `style-src ${cspSource} 'unsafe-inline'`,
        `font-src ${cspSource}`,
        `img-src ${cspSource} https: data:`,
        `media-src ${cspSource} https:`,
        `script-src 'nonce-${nonce}'`
    ].join('; ');
}
