/**
 * ライセンスサーバーとの通信（`src/shared/license/client.ts`）を固定する。
 *
 * HTTP を直接叩かず `FetchJson` ポートを注入する形にしてある。理由は 2 つ:
 *   - VS Code 1.74 が同梱する Node 16 には global fetch が無い（実装は `https` モジュール）
 *   - サーバーが落ちている・遅い・変な JSON を返すときの挙動を、実サーバー無しで固定したい
 *
 * ここでいちばん大事なのは **「サーバーに繋がらないことを、権利が無いことと混同しない」**
 * こと。混同すると、ネットワークが不安定なだけで購入者の PDF にクレジット行が戻る。
 */
import * as assert from 'assert';
import {
    fetchEntitlement,
    type FetchJson,
    type EntitlementOutcome
} from '../../../src/shared/license/client';

const BASE = 'https://ipreview-license.example.run.app';

function respondWith(body: unknown, status = 200): FetchJson {
    return () => Promise.resolve({ status, body });
}

async function call(fetchJson: FetchJson, licenseKey = 'IPVW-A1B2-C3D4-E5F6'): Promise<EntitlementOutcome> {
    return fetchEntitlement({ baseUrl: BASE, licenseKey }, fetchJson);
}

describe('ライセンスサーバーへの問い合わせ', () => {
    describe('正常系', () => {
        it('entitled: true ならトークンを返す', async () => {
            const outcome = await call(respondWith({ entitled: true, token: 'payload.sig' }));
            assert.deepStrictEqual(outcome, { kind: 'entitled', token: 'payload.sig' });
        });

        it('entitled: false なら「買っていない」を返す', async () => {
            const outcome = await call(respondWith({ entitled: false }));
            assert.deepStrictEqual(outcome, { kind: 'not-entitled' });
        });

        it('POST で /api/entitlement を叩き、キーを JSON で送る', async () => {
            const seen: { url?: string; init?: unknown } = {};
            const spy: FetchJson = (url, init) => {
                seen.url = url;
                seen.init = init;
                return Promise.resolve({ status: 200, body: { entitled: false } });
            };

            await call(spy, 'IPVW-1111-2222-3333');

            assert.strictEqual(seen.url, `${BASE}/api/entitlement`);
            assert.deepStrictEqual(seen.init, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ licenseKey: 'IPVW-1111-2222-3333' })
            });
        });

        it('baseUrl の末尾スラッシュがあってもパスが二重にならない', async () => {
            let seenUrl = '';
            const spy: FetchJson = (url) => {
                seenUrl = url;
                return Promise.resolve({ status: 200, body: { entitled: false } });
            };

            await fetchEntitlement({ baseUrl: `${BASE}/`, licenseKey: 'k' }, spy);
            assert.strictEqual(seenUrl, `${BASE}/api/entitlement`);
        });
    });

    describe('繋がらないとき（権利が無いこととは区別する）', () => {
        it('通信例外は unavailable', async () => {
            const outcome = await call(() => Promise.reject(new Error('ECONNREFUSED')));
            assert.strictEqual(outcome.kind, 'unavailable');
        });

        it('500 は unavailable', async () => {
            assert.strictEqual((await call(respondWith({}, 500))).kind, 'unavailable');
        });

        it('502 / 503 も unavailable', async () => {
            assert.strictEqual((await call(respondWith({}, 502))).kind, 'unavailable');
            assert.strictEqual((await call(respondWith({}, 503))).kind, 'unavailable');
        });

        it('HTML が返ってきても（プロキシのエラーページ等）unavailable', async () => {
            assert.strictEqual((await call(respondWith('<html>proxy error</html>'))).kind, 'unavailable');
        });

        it('entitled が真偽値でない壊れた JSON は unavailable', async () => {
            assert.strictEqual((await call(respondWith({ entitled: 'yes' }))).kind, 'unavailable');
        });

        it('entitled: true なのに token が無ければ unavailable（誤って Pro にしない）', async () => {
            assert.strictEqual((await call(respondWith({ entitled: true }))).kind, 'unavailable');
        });

        it('token が空文字でも unavailable', async () => {
            assert.strictEqual((await call(respondWith({ entitled: true, token: '' }))).kind, 'unavailable');
        });
    });

    describe('キーが間違っているとき', () => {
        it('400 は「キーが不正」として返す（再試行しても無駄なので区別する）', async () => {
            const outcome = await call(respondWith({ error: 'license_key_required' }, 400));
            assert.deepStrictEqual(outcome, { kind: 'invalid-request' });
        });

        it('429（レート制限）は「キー不正」ではなく判定不能として扱う', async () => {
            assert.strictEqual((await call(respondWith({ error: 'too_many_requests' }, 429))).kind, 'unavailable');
        });

        it('404 も invalid-request', async () => {
            assert.strictEqual((await call(respondWith({}, 404))).kind, 'invalid-request');
        });
    });
});
