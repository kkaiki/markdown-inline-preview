/**
 * 保存済みトークンをサーバーの応答でどう更新するか（`src/shared/license/refresh.ts`）を固定する。
 *
 * ここは**購入者の権利が消える唯一の経路**なので、分岐を全部押さえる。
 * 特に「サーバーに繋がらなかった」ときに保存済みトークンを消してしまうと、
 * 出張中・オフライン・社内プロキシ配下で購入者の PDF にクレジット行が戻る。
 */
import * as assert from 'assert';
import { applyEntitlementOutcome } from '../../../src/shared/license/refresh';
import type { EntitlementOutcome } from '../../../src/shared/license/client';

const STORED = 'stored.token';

function apply(outcome: EntitlementOutcome, stored: string | undefined = STORED) {
    return applyEntitlementOutcome(outcome, stored);
}

describe('サーバー応答の反映', () => {
    it('新しいトークンを受け取ったら保存し直す', () => {
        assert.deepStrictEqual(apply({ kind: 'entitled', token: 'fresh.token' }), {
            action: 'store',
            token: 'fresh.token'
        });
    });

    it('サーバーが「買っていない」と答えたら保存済みトークンを消す', () => {
        // 返金・チャージバック後はここで無料版に戻る
        assert.deepStrictEqual(apply({ kind: 'not-entitled' }), { action: 'clear' });
    });

    it('繋がらなかったら保存済みトークンを維持する（オフライン・障害）', () => {
        assert.deepStrictEqual(apply({ kind: 'unavailable' }), { action: 'keep' });
    });

    it('繋がらなかったとき、トークンを持っていなくても何もしない', () => {
        assert.deepStrictEqual(apply({ kind: 'unavailable' }, undefined), { action: 'keep' });
    });

    it('リクエストが不正なら保存済みトークンは維持し、利用者に知らせる', () => {
        // キーの打ち間違いで、既に有効なトークンを失わせてはいけない
        assert.deepStrictEqual(apply({ kind: 'invalid-request' }), {
            action: 'keep',
            notify: 'invalid-key'
        });
    });

    it('同じトークンが返ってきても保存し直す（有効期限が延びている）', () => {
        assert.deepStrictEqual(apply({ kind: 'entitled', token: STORED }), {
            action: 'store',
            token: STORED
        });
    });

    it('トークンを持っていない状態で「買っていない」と言われても clear でよい', () => {
        assert.deepStrictEqual(apply({ kind: 'not-entitled' }, undefined), { action: 'clear' });
    });
});
