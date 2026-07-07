import * as assert from 'assert';
import {
    prepareMarkdownImagesForWebview,
    restoreMarkdownImagesFromWebview
} from '../../../../src/preview/host/markdownTransform';

/**
 * Preview ⇄ ファイル保存の画像URL往復。特殊文字（括弧）を含むパスでも
 * 「webview URI へ変換 → Milkdown がエスケープして保存 → 相対パスへ復元」が壊れないこと。
 *
 * 背景: Milkdown は再シリアライズ時に URL 内の `(` `)` を `\(` `\)` にエスケープする。
 * restore がエスケープ無しの完全一致で戻していたため、括弧入りパスの画像が復元できず
 * 壊れた webview URI のままファイルへ保存されていた（Preview→Raw で画像が壊れる＝データ損失）。
 */
describe('画像URLの往復（特殊文字対応）', () => {
    const fakeWebview = {
        asWebviewUri(filePath: string): string {
            // 実 VSCode 同様、クエリ文字列付きの URI を返す。
            return `https://file+.vscode-resource.vscode-cdn.net${filePath}?id=abc-123`;
        }
    };

    /** Milkdown が保存時に行うエスケープを模す: 指定 URL 内の括弧を \( \) にする。 */
    function simulateMilkdownSave(markdown: string, webviewUri: string): string {
        const escaped = webviewUri.replace(/[()]/g, (c) => `\\${c}`);
        return markdown.split(webviewUri).join(escaped);
    }

    it('括弧を含むパスでも復元できる（データ損失の回帰防止）', () => {
        const source = '![a](assets/img(1).png)\n\ntail';
        const { markdown, uriMap } = prepareMarkdownImagesForWebview(source, '/ws/docs/readme.md', fakeWebview);
        assert.strictEqual(uriMap.size, 1, `括弧入りパスがマップに登録されていない: ${markdown}`);
        const webviewUri = [...uriMap.keys()][0];

        // Milkdown が保存時に括弧をエスケープした「ファイルに書かれる markdown」を模す
        const saved = simulateMilkdownSave(markdown, webviewUri);
        assert.ok(saved.includes('\\('), `エスケープ模擬が効いていない: ${saved}`);

        const restored = restoreMarkdownImagesFromWebview(saved, uriMap);
        assert.ok(!restored.includes('vscode-resource'), `webview URI が残った（データ損失）: ${restored}`);
        assert.ok(restored.includes('assets/img(1).png'), `相対パスへ戻っていない: ${restored}`);
    });

    it('角括弧 [ ] を含むパスでも復元できる', () => {
        const source = '![a](assets/a[1].png)\n\ntail';
        const { markdown, uriMap } = prepareMarkdownImagesForWebview(source, '/ws/docs/readme.md', fakeWebview);
        const webviewUri = [...uriMap.keys()][0];
        // Milkdown は `[` を `\[` にする
        const saved = markdown.split(webviewUri).join(webviewUri.replace(/\[/g, '\\['));
        const restored = restoreMarkdownImagesFromWebview(saved, uriMap);
        assert.ok(!restored.includes('vscode-resource'), `webview URI が残った: ${restored}`);
        assert.ok(restored.includes('assets/a[1].png'), `相対パスへ戻っていない: ${restored}`);
    });

    it('山括弧 <...> で囲んだスペース入りパスを画像として認識・往復できる', () => {
        // CommonMark ではスペースを含む URL は <...> で囲むのが正式。
        const source = '![a](<assets/my image.png>)\n\ntail';
        const { markdown, uriMap } = prepareMarkdownImagesForWebview(source, '/ws/docs/readme.md', fakeWebview);
        assert.strictEqual(uriMap.size, 1, `山括弧パスが画像として認識されていない: ${markdown}`);
        assert.ok(markdown.includes('vscode-resource'), `webview URI へ変換されていない: ${markdown}`);
        const restored = restoreMarkdownImagesFromWebview(markdown, uriMap);
        assert.ok(restored.includes('assets/my image.png'), `相対パスへ戻っていない: ${restored}`);
    });

    it('クエリ & を含む webview URI でも復元できる（実 VSCode の典型）', () => {
        // クエリ付き URL を返す webview（& を含む）
        const ampWebview = {
            asWebviewUri(filePath: string): string {
                return `https://file+.vscode-resource.vscode-cdn.net${filePath}?a=1&b=2`;
            }
        };
        const source = '![a](assets/pic.png)\n\ntail';
        const { markdown, uriMap } = prepareMarkdownImagesForWebview(source, '/ws/docs/readme.md', ampWebview);
        const webviewUri = [...uriMap.keys()][0];
        // Milkdown は URL 内の `&` を `\&` にする
        const saved = markdown.split(webviewUri).join(webviewUri.replace(/&/g, '\\&'));
        assert.ok(saved.includes('\\&'), `& エスケープ模擬が効いていない: ${saved}`);
        const restored = restoreMarkdownImagesFromWebview(saved, uriMap);
        assert.ok(!restored.includes('vscode-resource'), `webview URI が残った: ${restored}`);
        assert.ok(restored.includes('assets/pic.png'), `相対パスへ戻っていない: ${restored}`);
    });

    it('タイトル付き画像も復元できる', () => {
        const source = '![a](assets/pic.png "キャプション")\n\ntail';
        const { markdown, uriMap } = prepareMarkdownImagesForWebview(source, '/ws/docs/readme.md', fakeWebview);
        const restored = restoreMarkdownImagesFromWebview(markdown, uriMap);
        assert.ok(restored.includes('assets/pic.png'), `相対パスへ戻っていない: ${restored}`);
        assert.ok(restored.includes('"キャプション"'), `タイトルが失われた: ${restored}`);
    });

    it('（回帰）通常の相対パスは従来どおり往復できる', () => {
        const source = '![logo](./images/logo.png)\n\nText';
        const { markdown, uriMap } = prepareMarkdownImagesForWebview(source, '/ws/docs/readme.md', fakeWebview);
        const restored = restoreMarkdownImagesFromWebview(markdown, uriMap);
        assert.strictEqual(restored, source);
    });

    it('（回帰）絶対URLはマップに入らず変化しない', () => {
        const source = '![remote](https://example.com/a.png)';
        const { markdown, uriMap } = prepareMarkdownImagesForWebview(source, '/ws/docs/readme.md', fakeWebview);
        assert.strictEqual(uriMap.size, 0);
        assert.strictEqual(restoreMarkdownImagesFromWebview(markdown, uriMap), source);
    });
});
