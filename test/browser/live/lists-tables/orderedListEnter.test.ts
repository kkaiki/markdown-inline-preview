/**
 * Live モードの番号リストで Enter したとき、マーカーが重ならず番号が振り直されることを実 Chromium の実キー入力で固定する。
 *
 * ユーザー報告（2026-10-20）: 「3. …です。4. SEREAL社…」の「4.」の手前で Enter すると「4. 4. SEREAL社…」になった。
 * 規則そのものは `test/suite/live/editing-core/listEnterTidy.test.ts`（純関数）。ここは Enter キーから届くことを見る。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openLive, type LiveHandle } from '../../liveBrowserHarness';

describe('Live モード: 番号リストの Enter（実ブラウザ）', function () {
    this.timeout(120000);

    let browser: Browser | null = null;
    let h: LiveHandle | undefined;

    before(async () => {
        browser = await launchBrowser();
    });
    after(async function () {
        this.timeout(60000);
        await browser?.close();
    });
    afterEach(async () => {
        if (h) {
            assert.deepStrictEqual(h.errors, [], 'ページ内でエラーが出た');
            await h.close();
            h = undefined;
        }
    });

    it('項目の中の「4.」の手前で Enter すると「4. 4.」にならず、続く項目も繰り下がる', async function () {
        if (!browser) { this.skip(); return; }
        const doc = '3. 共有いただきたいです。4. SEREAL社に再送\n4. 次の項目\n';
        h = await openLive(browser, doc);
        await h.setCursor(doc.indexOf('4. SEREAL'));
        await h.press('Enter');
        assert.strictEqual(await h.doc(), '3. 共有いただきたいです。\n4. SEREAL社に再送\n5. 次の項目\n');
    });

    it('項目の行末で Enter して新しい項目を作ると、後ろの番号が繰り下がる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '1. A\n2. B\n3. C\n');
        await h.setCursor(4);
        await h.press('Enter');
        await h.type('新');
        assert.strictEqual(await h.doc(), '1. A\n2. 新\n3. B\n4. C\n');
    });
});
