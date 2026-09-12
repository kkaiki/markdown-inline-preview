/**
 * サーバー応答を保存済みトークンへどう反映するかの決定（純関数）。
 *
 * **購入者の権利が消える唯一の経路**なので、副作用（SecretStorage への書き込み）から
 * 判断を切り離してテスト可能にしてある。
 *
 * 原則: **判定できなかったときは何もしない。** サーバー障害・オフライン・社内プロキシで
 * 購入者の PDF にクレジット行が戻るのが、この機能で最も避けたい失敗。
 */

import type { EntitlementOutcome } from './client';

export type RefreshDecision =
    | { action: 'store'; token: string }
    | { action: 'clear' }
    | { action: 'keep'; notify?: 'invalid-key' };

export function applyEntitlementOutcome(
    outcome: EntitlementOutcome,
    _storedToken: string | undefined
): RefreshDecision {
    switch (outcome.kind) {
        case 'entitled':
            // 同じ値でも保存し直す。exp が延びているので、上書きしないと失効してしまう。
            return { action: 'store', token: outcome.token };

        case 'not-entitled':
            // 返金・チャージバック後はここで無料版に戻る。
            return { action: 'clear' };

        case 'invalid-request':
            // キーの打ち間違い。既に持っている有効なトークンを失わせない。
            return { action: 'keep', notify: 'invalid-key' };

        case 'unavailable':
            return { action: 'keep' };
    }
}
