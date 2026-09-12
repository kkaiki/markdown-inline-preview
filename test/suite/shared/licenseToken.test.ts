/**
 * ライセンストークン（Ed25519 署名）の検証ロジック（`src/shared/license/token.ts`）を固定する。
 *
 * 拡張は公開鍵しか持たず、サーバーが落ちていてもオフラインでも `exp` までは購入者として
 * ふるまえる必要がある。したがって検証は **ネットワークに出ない純関数** であり、
 * ここが唯一の判定実装になる。改竄・期限切れ・鍵ローテーションの扱いをこの層で固める。
 *
 * エンコード（base64url(JSON) を ASCII バイト列として署名する）はサーバーと共有する規約なので、
 * `encodeClaims()` を export してテストからも同じ手順で署名し、ラウンドトリップを検証する。
 */
import * as assert from 'assert';
import { generateKeyPairSync, sign as cryptoSign, type KeyObject } from 'crypto';
import {
    verifyLicenseToken,
    hasFeature,
    encodeClaims,
    assembleToken,
    LICENSE_TOKEN_VERSION,
    FEATURE_PDF_NO_CREDIT,
    type LicenseClaims
} from '../../../src/shared/license/token';

const NOW = 1_786_665_600; // 2026-08-10T00:00:00Z 付近の固定値
const DAY = 86_400;

function newKeyPair(): { publicPem: string; privateKey: KeyObject } {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    return {
        publicPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
        privateKey
    };
}

function makeClaims(over: Partial<LicenseClaims> = {}): LicenseClaims {
    return {
        v: LICENSE_TOKEN_VERSION,
        sub: 'usr_test',
        email: 'buyer@example.com',
        features: [FEATURE_PDF_NO_CREDIT],
        iat: NOW - DAY,
        exp: NOW + 29 * DAY,
        ...over
    };
}

function issue(privateKey: KeyObject, claims: LicenseClaims): string {
    const payload = encodeClaims(claims);
    const signature = cryptoSign(null, Buffer.from(payload, 'ascii'), privateKey);
    return assembleToken(payload, signature.toString('base64url'));
}

describe('ライセンストークンの検証', () => {
    describe('正常系', () => {
        it('自分の鍵で署名したトークンは検証を通り claims が取り出せる', () => {
            const { publicPem, privateKey } = newKeyPair();
            const claims = makeClaims();
            const result = verifyLicenseToken(issue(privateKey, claims), [publicPem], NOW);

            assert.strictEqual(result.ok, true);
            assert.deepStrictEqual(result.ok && result.claims, claims);
        });

        it('検証に通ったトークンは pdf-nocredit を持っていると判定される', () => {
            const { publicPem, privateKey } = newKeyPair();
            const result = verifyLicenseToken(issue(privateKey, makeClaims()), [publicPem], NOW);
            assert.strictEqual(hasFeature(result, FEATURE_PDF_NO_CREDIT), true);
        });

        it('持っていない機能は false を返す', () => {
            const { publicPem, privateKey } = newKeyPair();
            const claims = makeClaims({ features: [] });
            const result = verifyLicenseToken(issue(privateKey, claims), [publicPem], NOW);
            assert.strictEqual(hasFeature(result, FEATURE_PDF_NO_CREDIT), false);
        });

        it('鍵を複数登録しておけば 2 本目の鍵で署名したトークンも通る（鍵ローテーション）', () => {
            const oldKey = newKeyPair();
            const newKey = newKeyPair();
            const token = issue(newKey.privateKey, makeClaims());

            const result = verifyLicenseToken(token, [oldKey.publicPem, newKey.publicPem], NOW);
            assert.strictEqual(result.ok, true);
        });
    });

    describe('異常系', () => {
        it('別の鍵で署名されたトークンは bad-signature', () => {
            const trusted = newKeyPair();
            const attacker = newKeyPair();
            const token = issue(attacker.privateKey, makeClaims());

            const result = verifyLicenseToken(token, [trusted.publicPem], NOW);
            assert.deepStrictEqual(result, { ok: false, reason: 'bad-signature' });
        });

        it('payload を 1 文字でも書き換えると bad-signature', () => {
            const { publicPem, privateKey } = newKeyPair();
            const token = issue(privateKey, makeClaims());
            const [payload, signature] = token.split('.');
            const tampered = Buffer.from(payload, 'base64url').toString('utf-8')
                .replace('buyer@example.com', 'thief@example.com');
            const forged = assembleToken(Buffer.from(tampered, 'utf-8').toString('base64url'), signature);

            const result = verifyLicenseToken(forged, [publicPem], NOW);
            assert.deepStrictEqual(result, { ok: false, reason: 'bad-signature' });
        });

        it('exp を過ぎたトークンは expired', () => {
            const { publicPem, privateKey } = newKeyPair();
            const token = issue(privateKey, makeClaims({ exp: NOW - 1 }));

            const result = verifyLicenseToken(token, [publicPem], NOW);
            assert.deepStrictEqual(result, { ok: false, reason: 'expired' });
        });

        it('exp ちょうどはまだ有効', () => {
            const { publicPem, privateKey } = newKeyPair();
            const token = issue(privateKey, makeClaims({ exp: NOW }));
            assert.strictEqual(verifyLicenseToken(token, [publicPem], NOW).ok, true);
        });

        it('iat が 2 日以上未来のトークンは not-yet-valid（時計ずれの許容は 2 日まで）', () => {
            const { publicPem, privateKey } = newKeyPair();
            const token = issue(privateKey, makeClaims({ iat: NOW + 3 * DAY, exp: NOW + 40 * DAY }));

            const result = verifyLicenseToken(token, [publicPem], NOW);
            assert.deepStrictEqual(result, { ok: false, reason: 'not-yet-valid' });
        });

        it('iat が少しだけ未来（時計ずれ相当）なら通す', () => {
            const { publicPem, privateKey } = newKeyPair();
            const token = issue(privateKey, makeClaims({ iat: NOW + 3600 }));
            assert.strictEqual(verifyLicenseToken(token, [publicPem], NOW).ok, true);
        });

        it('知らないバージョンのトークンは unsupported-version', () => {
            const { publicPem, privateKey } = newKeyPair();
            const token = issue(privateKey, makeClaims({ v: LICENSE_TOKEN_VERSION + 1 }));

            const result = verifyLicenseToken(token, [publicPem], NOW);
            assert.deepStrictEqual(result, { ok: false, reason: 'unsupported-version' });
        });

        for (const [name, token] of [
            ['空文字', ''],
            ['ドットが無い', 'abcdef'],
            ['ドットが多すぎる', 'a.b.c'],
            ['payload が JSON でない', assembleToken(Buffer.from('not json').toString('base64url'), 'AAAA')],
            ['必須フィールドが欠けている', assembleToken(Buffer.from('{"v":1}').toString('base64url'), 'AAAA')],
            ['features が配列でない', assembleToken(
                Buffer.from(JSON.stringify({ ...makeClaims(), features: 'pdf-nocredit' })).toString('base64url'),
                'AAAA'
            )]
        ] as const) {
            it(`${name}トークンは malformed`, () => {
                const { publicPem } = newKeyPair();
                assert.deepStrictEqual(
                    verifyLicenseToken(token, [publicPem], NOW),
                    { ok: false, reason: 'malformed' }
                );
            });
        }

        it('公開鍵が 1 つも無ければ bad-signature（誤って Pro 扱いにしない）', () => {
            const { privateKey } = newKeyPair();
            const token = issue(privateKey, makeClaims());
            assert.deepStrictEqual(
                verifyLicenseToken(token, [], NOW),
                { ok: false, reason: 'bad-signature' }
            );
        });

        it('壊れた公開鍵が混ざっていても、正しい鍵があれば検証は通る', () => {
            const { publicPem, privateKey } = newKeyPair();
            const token = issue(privateKey, makeClaims());
            assert.strictEqual(
                verifyLicenseToken(token, ['-----BEGIN PUBLIC KEY-----\ngarbage\n-----END PUBLIC KEY-----\n', publicPem], NOW).ok,
                true
            );
        });

        it('検証に失敗した結果に対して hasFeature は常に false', () => {
            assert.strictEqual(hasFeature({ ok: false, reason: 'expired' }, FEATURE_PDF_NO_CREDIT), false);
        });
    });
});
