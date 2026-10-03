/**
 * 購入・復元の URL 組み立てと、ブラウザから戻ってくる deep link の解釈
 * （`src/shared/license/activationUri.ts`）を固定する。
 *
 * URI スキームを `vscode://` にハードコードすると Cursor / VSCodium / Insiders で
 * アクティベートが届かなくなる。ここは `vscode.env.uriScheme` を**引数で受け取る**純関数に
 * 切り出し、フォーク先でも正しいスキームが組まれることをこの層で担保する。
 *
 * deep link 側は外から来る文字列なので、想定外の path / query を Pro 扱いしないことが要件。
 */
import * as assert from 'assert';
import {
    buildPurchaseUrl,
    buildRestoreUrl,
    buildActivationRedirect,
    parseActivationUri,
    generateNonce,
    EXTENSION_ID
} from '../../../src/shared/license/activationUri';

const BASE = 'https://ipreview.app';

describe('購入・復元 URL の組み立て', () => {
    it('購入 URL はホームページ（/）を指し、nonce・URI スキーム・言語が載る', () => {
        const url = new URL(buildPurchaseUrl({
            baseUrl: BASE, nonce: 'n-123', uriScheme: 'vscode', language: 'ja'
        }));

        assert.strictEqual(url.origin + url.pathname, 'https://ipreview.app/');
        assert.strictEqual(url.searchParams.get('nonce'), 'n-123');
        assert.strictEqual(url.searchParams.get('uri_scheme'), 'vscode');
        assert.strictEqual(url.searchParams.get('lang'), 'ja');
    });

    it('Cursor から呼ばれたら uri_scheme に cursor が載る', () => {
        const url = new URL(buildPurchaseUrl({
            baseUrl: BASE, nonce: 'n', uriScheme: 'cursor', language: 'en'
        }));
        assert.strictEqual(url.searchParams.get('uri_scheme'), 'cursor');
    });

    it('baseUrl の末尾スラッシュがあってもパスが二重にならない', () => {
        const url = buildPurchaseUrl({
            baseUrl: 'https://ipreview.app/', nonce: 'n', uriScheme: 'vscode', language: 'en'
        });
        assert.ok(url.startsWith('https://ipreview.app/?'), url);
    });

    it('nonce に URL 予約文字が入ってもエスケープされる', () => {
        const url = new URL(buildPurchaseUrl({
            baseUrl: BASE, nonce: 'a&b=c', uriScheme: 'vscode', language: 'en'
        }));
        assert.strictEqual(url.searchParams.get('nonce'), 'a&b=c');
    });

    it('復元 URL は /activate に restore=1 を付ける', () => {
        const url = new URL(buildRestoreUrl({ baseUrl: BASE, nonce: 'n-9', uriScheme: 'vscode' }));

        assert.strictEqual(url.origin + url.pathname, 'https://ipreview.app/activate');
        assert.strictEqual(url.searchParams.get('nonce'), 'n-9');
        assert.strictEqual(url.searchParams.get('restore'), '1');
    });
});

describe('サーバーが返す deep link の組み立て', () => {
    it('拡張 ID を含む <scheme>://<extensionId>/activate?token=… になる', () => {
        const link = buildActivationRedirect({ uriScheme: 'vscode', token: 'tok.sig' });
        assert.strictEqual(link, `vscode://${EXTENSION_ID}/activate?token=tok.sig`);
    });

    it('token はパーセントエンコードされる', () => {
        const link = buildActivationRedirect({ uriScheme: 'vscode', token: 'a+b/c=' });
        assert.strictEqual(link, `vscode://${EXTENSION_ID}/activate?token=a%2Bb%2Fc%3D`);
    });
});

describe('deep link の解釈', () => {
    it('/activate?token=… から token を取り出す', () => {
        assert.deepStrictEqual(
            parseActivationUri({ path: '/activate', query: 'token=abc.def' }),
            { token: 'abc.def' }
        );
    });

    it('先頭スラッシュが無い path でも受け付ける', () => {
        assert.deepStrictEqual(
            parseActivationUri({ path: 'activate', query: 'token=abc.def' }),
            { token: 'abc.def' }
        );
    });

    it('token 以外のクエリが付いていても取り出せる', () => {
        assert.deepStrictEqual(
            parseActivationUri({ path: '/activate', query: 'source=web&token=abc.def' }),
            { token: 'abc.def' }
        );
    });

    it('パーセントエンコードされた token は復号される', () => {
        assert.deepStrictEqual(
            parseActivationUri({ path: '/activate', query: 'token=a%2Bb%2Fc%3D' }),
            { token: 'a+b/c=' }
        );
    });

    for (const [name, input] of [
        ['知らない path', { path: '/unlock', query: 'token=abc' }],
        ['token が無い', { path: '/activate', query: 'foo=bar' }],
        ['token が空', { path: '/activate', query: 'token=' }],
        ['query が空', { path: '/activate', query: '' }],
        ['path が空', { path: '', query: 'token=abc' }]
    ] as const) {
        it(`${name}の deep link は null（無視する）`, () => {
            assert.strictEqual(parseActivationUri(input), null);
        });
    }
});

describe('deep link でライセンスキーも受け取る（30 日後の静かな更新に必要）', () => {
    const KEY = 'IPVW-A1B2-C3D4-E5F6';

    it('key を付けて組み立てると &key=… が載る', () => {
        const link = buildActivationRedirect({ uriScheme: 'vscode', token: 'tok.sig', key: KEY });
        assert.strictEqual(link, `vscode://${EXTENSION_ID}/activate?token=tok.sig&key=${KEY}`);
    });

    it('key を渡さなければ従来どおり token だけ', () => {
        const link = buildActivationRedirect({ uriScheme: 'vscode', token: 'tok.sig' });
        assert.ok(!link.includes('key='), link);
    });

    it('token と key の両方を取り出せる', () => {
        assert.deepStrictEqual(
            parseActivationUri({ path: '/activate', query: `token=abc.def&key=${KEY}` }),
            { token: 'abc.def', key: KEY }
        );
    });

    it('形式が違う key は捨てる（token だけ受け付ける）', () => {
        assert.deepStrictEqual(
            parseActivationUri({ path: '/activate', query: 'token=abc.def&key=not-a-key' }),
            { token: 'abc.def' }
        );
    });
});

describe('nonce の生成', () => {
    it('呼ぶたびに違う値になる', () => {
        const seen = new Set(Array.from({ length: 200 }, () => generateNonce()));
        assert.strictEqual(seen.size, 200);
    });

    it('URL にそのまま載せられる文字だけで、128bit 以上のエントロピーがある', () => {
        const nonce = generateNonce();
        assert.match(nonce, /^[A-Za-z0-9_-]+$/);
        assert.ok(Buffer.from(nonce, 'base64url').length >= 16, nonce);
    });

    it('乱数源は注入でき、その値から作られる（Math.random や時刻に頼らない）', () => {
        assert.strictEqual(generateNonce(() => Buffer.alloc(16, 0xff)), '_____________________w');
    });
});
