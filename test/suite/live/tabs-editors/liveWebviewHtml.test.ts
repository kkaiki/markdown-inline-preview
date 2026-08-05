/**
 * Live モード webview の HTML 組み立て（純関数）のテスト。
 *
 * 2026-08-05 に「host 側の HTML に KaTeX の CSS を入れ忘れ、数式が MathML と
 * 二重に描画される」不具合を実際に踏んだ。webview の見た目はブラウザテスト
 * （バンドルを直接読む固定 HTML）では検出できないため、host が組み立てる HTML
 * そのものをここで検証する。
 */
import * as assert from 'assert';
import { buildLiveWebviewHtml } from '../../../../src/live/shared/liveWebviewHtml';

const ASSETS = {
    scriptUri: 'vscode-webview://x/media/live.bundle.js',
    styleUri: 'vscode-webview://x/media/live-preview.css',
    katexStyleUri: 'vscode-webview://x/media/katex.min.css',
    csp: "default-src 'none'",
    nonce: 'abc123'
};

describe('Live モード: webview HTML の組み立て', () => {
    it('Live のスタイルシートを読み込む', () => {
        assert.ok(buildLiveWebviewHtml(ASSETS).includes(ASSETS.styleUri));
    });

    it('KaTeX のスタイルシートを読み込む（数式が MathML と二重に見えるのを防ぐ）', () => {
        assert.ok(
            buildLiveWebviewHtml(ASSETS).includes(ASSETS.katexStyleUri),
            'KaTeX の CSS が読み込まれていない'
        );
    });

    it('KaTeX の CSS は Live の CSS より先に読み込む（上書きできるように）', () => {
        const html = buildLiveWebviewHtml(ASSETS);
        assert.ok(html.indexOf(ASSETS.katexStyleUri) < html.indexOf(ASSETS.styleUri));
    });

    it('スクリプトを nonce 付きで読み込む', () => {
        const html = buildLiveWebviewHtml(ASSETS);
        assert.ok(html.includes(`nonce="${ASSETS.nonce}"`));
        assert.ok(html.includes(ASSETS.scriptUri));
    });

    it('CSP を meta タグに入れる', () => {
        assert.ok(buildLiveWebviewHtml(ASSETS).includes(`content="${ASSETS.csp}"`));
    });

    it('エディタのマウント先 #live-root を持つ', () => {
        assert.ok(buildLiveWebviewHtml(ASSETS).includes('id="live-root"'));
    });
});
