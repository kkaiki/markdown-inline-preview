/**
 * ライセンストークンの形式が**ライセンスサーバーと一致している**ことを固定する。
 *
 * サーバー（別リポ `ipreview-license`）が署名し、この拡張が検証する。両者は
 * コードを共有できないので、**固定のテストベクタ**（固定鍵・固定 claims・
 * 期待されるトークン文字列）を両方に置いて突き合わせる。
 * ここが 1 バイトでもずれると「払ったのに解放されない」という最悪の事故になる。
 *
 * 対になるテスト: `ipreview-license` の `tests/licenseToken.test.ts` / `tests/vectors.ts`。
 * **片方だけ変えてはいけない。** 変えるときは両方を同時に更新し、両方のテストを走らせる。
 *
 * ここに書いてある鍵は**テスト専用**。本番の公開鍵は `src/license/publicKey.ts`。
 */
import * as assert from 'assert';
import {
    verifyLicenseToken,
    hasFeature,
    LICENSE_TOKEN_VERSION,
    FEATURE_PDF_NO_CREDIT
} from '../../../src/shared/license/token';

const VECTOR_PUBLIC_KEY_PEM =
    '-----BEGIN PUBLIC KEY-----\n' +
    'MCowBQYDK2VwAyEAFyT7EwFVbU5oAKLNceTsS8hJXMKmq3T1FdEoLHXiye8=\n' +
    '-----END PUBLIC KEY-----\n';

const VECTOR_TOKEN =
    'eyJ2IjoxLCJzdWIiOiJ1c3JfdmVjdG9yXzAwMDEiLCJlbWFpbCI6InZlY3RvckBleGFtcGxlLmNvbSIsImZlYXR1cmVzIjpbInBkZi1ub2NyZWRpdCJdLCJpYXQiOjE3ODY2NjU2MDAsImV4cCI6MTc4OTI1NzYwMH0' +
    '.o34BHNCr_cw0OlS6An_1DtMOcVk0NQEcFXhwFNBY3taf6W_wNqsogThn4iNO_WZHpodYjwRHhX1NoTbR-fJNCg';

const VECTOR_IAT = 1_786_665_600;
const VECTOR_EXP = 1_789_257_600;

describe('ライセンスサーバーとのトークン形式の契約', () => {
    it('サーバーが発行したトークン（固定ベクタ）を検証できる', () => {
        const result = verifyLicenseToken(VECTOR_TOKEN, [VECTOR_PUBLIC_KEY_PEM], VECTOR_IAT);

        assert.strictEqual(result.ok, true, `検証に失敗: ${JSON.stringify(result)}`);
        assert.deepStrictEqual(result.ok && result.claims, {
            v: 1,
            sub: 'usr_vector_0001',
            email: 'vector@example.com',
            features: ['pdf-nocredit'],
            iat: VECTOR_IAT,
            exp: VECTOR_EXP
        });
    });

    it('そのトークンは pdf-nocredit を解放する', () => {
        const result = verifyLicenseToken(VECTOR_TOKEN, [VECTOR_PUBLIC_KEY_PEM], VECTOR_IAT);
        assert.strictEqual(hasFeature(result, FEATURE_PDF_NO_CREDIT), true);
    });

    it('サーバーの有効期間は 30 日', () => {
        assert.strictEqual(VECTOR_EXP - VECTOR_IAT, 30 * 86_400);
    });

    it('サーバーと共有する定数が一致している', () => {
        assert.strictEqual(LICENSE_TOKEN_VERSION, 1);
        assert.strictEqual(FEATURE_PDF_NO_CREDIT, 'pdf-nocredit');
    });

    it('期限（発行から 30 日）を 1 秒過ぎたら失効する', () => {
        const result = verifyLicenseToken(VECTOR_TOKEN, [VECTOR_PUBLIC_KEY_PEM], VECTOR_EXP + 1);
        assert.deepStrictEqual(result, { ok: false, reason: 'expired' });
    });
});
