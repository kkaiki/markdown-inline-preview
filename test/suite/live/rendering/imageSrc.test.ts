/**
 * Live モードの画像パスの解決（純関数）。
 *
 * webview は Markdown ファイルの場所を知らないので、`./img.gif` のような相対パスは
 * host から渡された「md ファイルのディレクトリ」の webview URL を基準に解決する。
 * URL・data URI・ルート相対はそのまま。
 */
import * as assert from 'assert';
import { resolveImageSrc } from '../../../../src/live/shared/imageSrc';

const BASE = 'https://file+.vscode-resource.vscode-cdn.net/Users/me/notes/';

describe('Live モード: 画像パスの解決', () => {
    it('./ 付きの相対パスは md ファイルのディレクトリを基準にする', () => {
        assert.strictEqual(resolveImageSrc('./cat.gif', BASE), `${BASE}cat.gif`);
    });

    it('ファイル名だけでも md ファイルのディレクトリを基準にする', () => {
        assert.strictEqual(resolveImageSrc('cat.png', BASE), `${BASE}cat.png`);
    });

    it('サブフォルダと親フォルダも解決し、空白はエンコードする', () => {
        assert.strictEqual(resolveImageSrc('img/a b.png', BASE), `${BASE}img/a%20b.png`);
        assert.strictEqual(resolveImageSrc('../shared/x.png', BASE), 'https://file+.vscode-resource.vscode-cdn.net/Users/me/shared/x.png');
    });

    it('http / https / data の URL はそのまま', () => {
        for (const src of ['https://example.com/a.gif', 'http://example.com/a.png', 'data:image/png;base64,AAAA']) {
            assert.strictEqual(resolveImageSrc(src, BASE), src);
        }
    });

    it('基準が無ければ（テストや古い host）そのまま返す', () => {
        assert.strictEqual(resolveImageSrc('./cat.gif', undefined), './cat.gif');
    });
});
