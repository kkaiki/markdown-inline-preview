/**
 * 単語の途中のアンダースコアが実 Chromium 上でも斜体・太字にならないことを固定する。
 *
 * 純関数テスト（test/suite/live/rendering/intrawordUnderscore.test.ts）だけでは
 * 「decoration が実際に当たっていないか」「記号が隠れて原文が読めなくなっていないか」
 * までは分からないので、実 DOM で `.cm-live-em` / `.cm-live-strong` の有無と
 * 画面に出ている行テキストを確認する（ユーザー報告 2026-09-12）。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openLive, type LiveHandle } from '../../liveBrowserHarness';

const DOC = 'カーソル行\ncore_api_app と MY_ENV_VAR と test_helper_util.ts\nこれは _斜体_ と __太字__ です\n';

describe('Live モード: 単語途中のアンダースコア（実ブラウザ）', function () {
    this.timeout(120000);

    let browser: Browser | null = null;
    let h: LiveHandle | undefined;

    before(async () => {
        browser = await launchBrowser();
    });
    after(async function () {
        // 全スイート連続実行では後始末（browser.close）が 20 秒に収まらず
        // "after all" hook がタイムアウトすることがある（2026-09-12）。
        this.timeout(60000);
        await browser?.close();
    });
    afterEach(async () => {
        if (h) {
            await h.close();
            h = undefined;
        }
    });

    it('snake_case の行は原文のまま表示され、斜体・太字の装飾が付かない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, DOC);
        await h.setCursor(0); // 1行目にカーソル（2行目は収縮表示のまま）

        assert.strictEqual(
            await h.renderedLine(2),
            'core_api_app と MY_ENV_VAR と test_helper_util.ts',
            'アンダースコアが隠れずに原文のまま見えること'
        );

        const emTexts = await h.page.evaluate(
            `Array.from(document.querySelectorAll('.cm-live-em, .cm-live-strong')).map((e) => e.textContent)`
        );
        assert.deepStrictEqual(emTexts, ['斜体', '太字'], '強調は空白で区切られたものだけ');
        assert.deepStrictEqual(h.errors, []);
    });
});
