import * as assert from 'assert';
import { buildPreviewCsp } from '../../../../src/preview/host/csp';

/**
 * Preview webview の Content-Security-Policy 文字列組み立てのテスト。
 * 動画・音声埋め込み（`<video>`/`<audio>`）は media-src が無いと CSP でブロックされて
 * 再生できないため、img-src と同様にローカルリソース + https を許可する media-src が
 * 含まれることを保証する。
 */
describe('buildPreviewCsp（webview CSP 文字列組み立て）', () => {
    it('media-src に cspSource（ローカルリソース）と https: を含む', () => {
        const csp = buildPreviewCsp('https://abc123.vscode-cdn.net', 'nonce-value');
        const mediaSrc = csp.split('; ').find((d) => d.startsWith('media-src'));
        assert.ok(mediaSrc, `media-src ディレクティブが無い: ${csp}`);
        assert.ok(mediaSrc?.includes('https://abc123.vscode-cdn.net'), `cspSource を含まない: ${mediaSrc}`);
        assert.ok(mediaSrc?.includes('https:'), `https: を含まない: ${mediaSrc}`);
    });

    it('既存の img-src・script-src・default-src は維持される（回帰防止）', () => {
        const csp = buildPreviewCsp('https://abc123.vscode-cdn.net', 'the-nonce');
        assert.ok(csp.includes("default-src 'none'"));
        assert.ok(csp.includes('img-src https://abc123.vscode-cdn.net https: data:'));
        assert.ok(csp.includes("script-src 'nonce-the-nonce'"));
    });
});
