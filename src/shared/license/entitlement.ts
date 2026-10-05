/**
 * 「この PDF にクレジット行を入れるか」「トークンを更新しに行くか」の判定（純関数）。
 *
 * PDF 書き出しの直前にネットワークへ出ないので、材料は保存済みトークンの検証結果だけ。
 * 更新はバックグラウンドでだけ行い、失敗しても `exp` までは購入者のままにする
 * （サーバーが落ちても買った人が困らないようにするのが、この設計全体の目的）。
 */

import {
    hasFeature,
    isLicenseFailure,
    FEATURE_PDF_NO_CREDIT,
    type LicenseVerifyResult
} from './token';

/**
 * 購入導線（購入ページ・ライセンスサーバー）が出荷されるまで false にしておく安全弁。
 * 買う手段が無い状態でクレジット行だけ出す、という事故を型と定数で防ぐ。
 *
 * **true にする前に必ず確認すること**:
 *   1. ライセンスサーバーがデプロイ済みで、`markdownInline.license.serverUrl` の
 *      既定値（`src/license/licenseCommands.ts` の `DEFAULT_BASE_URL`）が実 URL になっている
 *   2. `src/license/publicKey.ts` に本番の公開鍵が入っている（空だと誰も Pro になれない）
 *   3. 購入ページの特商法表記・利用規約・プライバシーポリシーが公開されている
 *
 * どれか 1 つでも欠けたまま true にすると、「クレジット行が出るのに消す手段が無い」
 * という最悪の状態で出荷される。
 */
export const MONETIZATION_ENABLED = true;

/** 失効の何秒前から更新を試み始めるか（7 日）。 */
export const REFRESH_BEFORE_EXPIRY_SEC = 7 * 86_400;

/** `markdownInline.export.creditLine` の値。 */
export type CreditLineSetting = 'auto' | 'always';

export interface CreditDecisionInput {
    /** 保存済みトークンの検証結果 */
    license: LicenseVerifyResult;
    /** 購入導線が出荷済みか（通常は `MONETIZATION_ENABLED`） */
    monetizationEnabled: boolean;
    /** ユーザー設定 */
    setting: CreditLineSetting;
}

/** 生成する PDF にクレジット行を入れるべきか。 */
export function shouldIncludeCredit(input: CreditDecisionInput): boolean {
    // 買う手段が無いうちは誰にも出さない。
    if (!input.monetizationEnabled) return false;

    // 購入者が自分の意思で残すぶんには尊重する。
    if (input.setting === 'always') return true;

    return !hasFeature(input.license, FEATURE_PDF_NO_CREDIT);
}

/**
 * ツールバーの PDF ボタンに「PRO+」バッジを出すべきか。
 *
 * 販売が有効で、クレジット行の除去を未購入のときだけ出す（買えないのに促さない／購入者には出さない）。
 * 購入者が `export.creditLine = always` にしていてもバッジは出さないので、setting は見ない。
 */
export function shouldShowProBadge(input: Pick<CreditDecisionInput, 'license' | 'monetizationEnabled'>): boolean {
    return shouldIncludeCredit({ ...input, setting: 'auto' });
}

export type ExportPromptInput = Pick<CreditDecisionInput, 'license' | 'monetizationEnabled'>;

/**
 * PDF 書き出しの**前**に「このまま無料で出すか、購入して消すか」を確認するダイアログを出すべきか。
 *
 * 未購入かつ販売中なら**毎回**出す（`shouldShowProBadge` と同じ条件）。
 * 以前は 1 回目と 5 回に 1 回に間引いていたが、ユーザー要望で毎回にした（2026-09-29）。
 */
export function shouldPromptBeforeExport(input: ExportPromptInput): boolean {
    return shouldShowProBadge(input);
}

/**
 * PRO+ の機能（クレジット行以外）を使えるか。
 *   - `allowed`: 購入者
 *   - `locked`: 販売中・未購入 → 購入案内を出す
 *   - `unavailable`: 販売前 → 買えないので案内も出さない（コマンド自体を出さない）
 */
export type ProFeatureAccess = 'allowed' | 'locked' | 'unavailable';

export function proFeatureAccess(
    input: Pick<CreditDecisionInput, 'license' | 'monetizationEnabled'> & { feature: string }
): ProFeatureAccess {
    if (!input.monetizationEnabled) return 'unavailable';
    return hasFeature(input.license, input.feature) ? 'allowed' : 'locked';
}

/**
 * バックグラウンドでトークンを取り直すべきか。
 *
 * 署名が壊れている・知らないバージョンといった「取り直しても直らない」失敗では
 * サーバーを叩かない（無駄なリクエストを毎回投げないため）。
 */
/** 起動中にサーバーへ再確認する間隔（24 時間）。返金・チャージバックを、最長で 1 日で拾うため。 */
export const RECHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * 保存済みのキーで、サーバーに「まだ有効か」を確認するか。
 *
 * 以前は期限の 7 日前になるまで確認しなかったので、返金してもトークンの期限（最長 30 日）まで
 * PRO+ が動き続けた。**キーがあれば、期限に関係なく確認する**（起動時と 24 時間ごと）。
 * 署名が壊れている・知らないバージョンのような、取り直しても直らない失敗ではサーバーを叩かない。
 * 繋がらなかったときは保存済みトークンを維持する（`applyEntitlementOutcome`）ので、オフラインは困らない。
 */
export function shouldRecheckWithServer(input: { hasKey: boolean; license: LicenseVerifyResult }): boolean {
    if (!input.hasKey) return false;
    if (isLicenseFailure(input.license)) {
        return input.license.reason === 'malformed' || input.license.reason === 'expired';
    }
    return true;
}

export function needsTokenRefresh(license: LicenseVerifyResult, nowSec: number): boolean {
    if (isLicenseFailure(license)) {
        return license.reason === 'malformed' || license.reason === 'expired';
    }
    return license.claims.exp - nowSec <= REFRESH_BEFORE_EXPIRY_SEC;
}
