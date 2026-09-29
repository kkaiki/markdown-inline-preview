/**
 * 「この PDF にクレジット行を入れるか」「保存済みトークンを更新しに行くか」を決める
 * 純関数（`src/shared/license/entitlement.ts`）を固定する。
 *
 * PDF 書き出しの直前にネットワークへ出ないので、判定材料はローカルの検証結果だけ。
 * 判定を間違えると「払ったのにクレジットが残る」（最悪の体験）か
 * 「払っていないのに消える」（収益ゼロ）のどちらかになるため、分岐をここで全部固定する。
 *
 * `monetizationEnabled` は購入導線が出荷されるまで false のままにする安全弁。
 * 買う手段が無いのにクレジット行だけ出す状態を作らないための明示的なフラグ。
 */
import * as assert from 'assert';
import {
    shouldIncludeCredit,
    shouldShowProBadge,
    shouldPromptBeforeExport,
    proFeatureAccess,
    needsTokenRefresh,
    REFRESH_BEFORE_EXPIRY_SEC,
    type CreditDecisionInput
} from '../../../src/shared/license/entitlement';
import {
    FEATURE_PDF_NO_CREDIT,
    FEATURE_DOCX_EXPORT,
    PRO_PLUS_FEATURES,
    type LicenseVerifyResult
} from '../../../src/shared/license/token';

const NOW = 1_786_665_600;
const DAY = 86_400;

function validToken(features: string[] = [FEATURE_PDF_NO_CREDIT]): LicenseVerifyResult {
    return {
        ok: true,
        claims: { v: 1, sub: 'usr', email: 'a@example.com', features, iat: NOW - DAY, exp: NOW + 29 * DAY }
    };
}

function input(over: Partial<CreditDecisionInput> = {}): CreditDecisionInput {
    return {
        license: { ok: false, reason: 'malformed' },
        monetizationEnabled: true,
        setting: 'auto',
        ...over
    };
}

describe('クレジット行を入れるかの判定', () => {
    it('購入導線が未出荷（monetizationEnabled=false）なら、誰の PDF にも入れない', () => {
        assert.strictEqual(
            shouldIncludeCredit(input({ monetizationEnabled: false })),
            false
        );
    });

    it('購入導線が未出荷なら、setting が always でも入れない', () => {
        assert.strictEqual(
            shouldIncludeCredit(input({ monetizationEnabled: false, setting: 'always' })),
            false
        );
    });

    it('有効なトークンが無ければ入れる（無料版）', () => {
        assert.strictEqual(shouldIncludeCredit(input()), true);
    });

    it('pdf-nocredit を持つ有効なトークンがあれば入れない（購入者）', () => {
        assert.strictEqual(shouldIncludeCredit(input({ license: validToken() })), false);
    });

    it('トークンは有効でも pdf-nocredit を持っていなければ入れる', () => {
        assert.strictEqual(shouldIncludeCredit(input({ license: validToken([]) })), true);
    });

    it('期限切れのトークンしか無ければ入れる', () => {
        assert.strictEqual(
            shouldIncludeCredit(input({ license: { ok: false, reason: 'expired' } })),
            true
        );
    });

    it('購入者が setting=always にしたら、あえて入れる（プロジェクト支援）', () => {
        assert.strictEqual(
            shouldIncludeCredit(input({ license: validToken(), setting: 'always' })),
            true
        );
    });
});

describe('ツールバーの PRO+ バッジを出すかの判定', () => {
    it('購入導線が未出荷（monetizationEnabled=false）なら出さない（買えないのに促さない）', () => {
        assert.strictEqual(shouldShowProBadge({ license: input().license, monetizationEnabled: false }), false);
    });

    it('未購入なら出す', () => {
        assert.strictEqual(shouldShowProBadge({ license: input().license, monetizationEnabled: true }), true);
    });

    it('購入者には出さない', () => {
        assert.strictEqual(shouldShowProBadge({ license: validToken(), monetizationEnabled: true }), false);
    });

    it('購入者が creditLine=always にしていても出さない（もう買っているので）', () => {
        assert.strictEqual(shouldShowProBadge({ license: validToken(), monetizationEnabled: true }), false);
        assert.strictEqual(shouldIncludeCredit(input({ license: validToken(), setting: 'always' })), true);
    });
});

describe('PDF 書き出し前に確認ダイアログを出すかの判定', () => {
    // ユーザー要望 2026-09-29:「毎回、購入を促すポップアップにして欲しい。1 回目だけになっている気がする」
    // 以前は 1 回目と 5 回に 1 回だけに間引いていた（EXPORT_PROMPT_INTERVAL）。回数は数えなくなった。
    it('購入導線が未出荷（monetizationEnabled=false）なら出さない', () => {
        assert.strictEqual(shouldPromptBeforeExport({ license: input().license, monetizationEnabled: false }), false);
    });

    it('購入者には出さない', () => {
        assert.strictEqual(shouldPromptBeforeExport({ license: validToken(), monetizationEnabled: true }), false);
    });

    it('未購入なら毎回出す（間引かない）', () => {
        for (let n = 1; n <= 10; n++) {
            assert.strictEqual(
                shouldPromptBeforeExport({ license: input().license, monetizationEnabled: true }),
                true,
                `${n} 回目`
            );
        }
    });
});

describe('PRO+ の機能を使えるかの判定（Word・まとめて書き出し・Marp・PDF の体裁）', () => {
    it('購入導線が未出荷（monetizationEnabled=false）なら unavailable（買えないのでロック画面も出さない）', () => {
        assert.strictEqual(
            proFeatureAccess({ license: input().license, monetizationEnabled: false, feature: FEATURE_DOCX_EXPORT }),
            'unavailable'
        );
    });

    it('未購入なら locked（購入案内を出す）', () => {
        assert.strictEqual(
            proFeatureAccess({ license: input().license, monetizationEnabled: true, feature: FEATURE_DOCX_EXPORT }),
            'locked'
        );
    });

    it('PRO+ の購入者なら allowed', () => {
        assert.strictEqual(
            proFeatureAccess({ license: validToken([...PRO_PLUS_FEATURES]), monetizationEnabled: true, feature: FEATURE_DOCX_EXPORT }),
            'allowed'
        );
    });

    it('その機能を含まないトークン（以前の単品購入のまま更新されていない等）なら locked', () => {
        assert.strictEqual(
            proFeatureAccess({ license: validToken([FEATURE_PDF_NO_CREDIT]), monetizationEnabled: true, feature: FEATURE_DOCX_EXPORT }),
            'locked'
        );
    });

    it('期限切れのトークンなら locked', () => {
        assert.strictEqual(
            proFeatureAccess({ license: { ok: false, reason: 'expired' }, monetizationEnabled: true, feature: FEATURE_DOCX_EXPORT }),
            'locked'
        );
    });
});

describe('トークンを更新しに行くかの判定', () => {
    it('トークンが無ければ更新に行く', () => {
        assert.strictEqual(needsTokenRefresh({ ok: false, reason: 'malformed' }, NOW), true);
    });

    it('期限切れなら更新に行く', () => {
        assert.strictEqual(needsTokenRefresh({ ok: false, reason: 'expired' }, NOW), true);
    });

    it('署名が壊れているトークンは更新に行かない（サーバーを無駄に叩かない）', () => {
        assert.strictEqual(needsTokenRefresh({ ok: false, reason: 'bad-signature' }, NOW), false);
    });

    it('有効期限まで十分あるなら更新に行かない', () => {
        assert.strictEqual(needsTokenRefresh(validToken(), NOW), false);
    });

    it('有効期限が近づいたら更新に行く', () => {
        const soon: LicenseVerifyResult = {
            ok: true,
            claims: {
                v: 1, sub: 'usr', email: 'a@example.com', features: [FEATURE_PDF_NO_CREDIT],
                iat: NOW - 23 * DAY, exp: NOW + REFRESH_BEFORE_EXPIRY_SEC - 1
            }
        };
        assert.strictEqual(needsTokenRefresh(soon, NOW), true);
    });
});
