/**
 * Live モードの Enter / Backspace / Tab / Home を、実 Chromium の実キー入力で固定する。
 *
 * 期待値は Obsidian 実測（obsidian-observed-spec.md §4）そのまま。
 * **Backspace が記法解除しない**ことは既存 Preview / Raw モードと正反対の要件なので、
 * ここで明示的にロックする（requirements.md R3.2・受け入れ基準 #4）。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openLive, type LiveHandle } from '../../liveBrowserHarness';

describe('Live モード: キー操作（実ブラウザ）', function () {
    this.timeout(120000);

    let browser: Browser | null = null;
    let h: LiveHandle | undefined;

    before(async () => {
        browser = await launchBrowser();
    });
    after(async function () {
        this.timeout(20000);
        await browser?.close();
    });
    afterEach(async () => {
        if (h) {
            await h.close();
            h = undefined;
        }
    });

    describe('Enter', () => {
        it('リスト項目の行末で Enter すると次の項目ができる', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, '- 項目1\n');
            await h.setCursor(5);
            await h.press('Enter');
            assert.strictEqual(await h.doc(), '- 項目1\n- \n');
            assert.strictEqual(await h.cursor(), 8);
        });

        it('空のリスト項目で Enter するとマーカーだけ消えて行は増えない', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, '- 項目1\n- \n');
            await h.setCursor(8);
            await h.press('Enter');
            assert.strictEqual(await h.doc(), '- 項目1\n\n');
        });

        it('番号リストは次の番号を自動採番する', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, '1. 番号1\n');
            await h.setCursor(6);
            await h.press('Enter');
            assert.strictEqual(await h.doc(), '1. 番号1\n2. \n');
        });

        it('チェック済み項目で Enter すると新項目は未チェックで始まる', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, '- [x] 済み\n');
            await h.setCursor(8);
            await h.press('Enter');
            assert.strictEqual(await h.doc(), '- [x] 済み\n- [ ] \n');
        });

        it('引用行の行末で Enter すると "> " を継続する', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, '> 引用\n');
            await h.setCursor(4);
            await h.press('Enter');
            assert.strictEqual(await h.doc(), '> 引用\n> \n');
        });

        it('見出しの行末で Enter してもプレフィックスを引き継がない', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, '# 見出し\n');
            await h.setCursor(5);
            await h.press('Enter');
            assert.strictEqual(await h.doc(), '# 見出し\n\n');
        });
    });

    describe('Backspace（記法解除をしない）', () => {
        const cases: [string, string, number, string][] = [
            ['リスト本文の先頭', '- 項目1\n', 2, '-項目1\n'],
            ['チェックボックス本文の先頭', '- [ ] タスク\n', 6, '- [ ]タスク\n'],
            ['見出し本文の先頭', '# 見出し\n', 2, '#見出し\n'],
            ['引用本文の先頭', '> 引用\n', 2, '>引用\n']
        ];
        for (const [name, before, at, after] of cases) {
            it(`${name}で Backspace しても素の1文字削除になる`, async function () {
                if (!browser) { this.skip(); return; }
                h = await openLive(browser, before);
                await h.setCursor(at);
                await h.press('Backspace');
                assert.strictEqual(await h.doc(), after);
            });
        }
    });

    describe('Home（スマートホームはリスト系のみ）', () => {
        it('リスト行では 本文先頭 → 行頭 の2段階になる', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, '- 項目1\n');
            await h.setCursor(4);
            await h.press('Home');
            assert.strictEqual(await h.cursor(), 2);
            await h.press('Home');
            assert.strictEqual(await h.cursor(), 0);
        });

        it('見出し行では一気に行頭へ行く', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, '# 見出し\n');
            await h.setCursor(4);
            await h.press('Home');
            assert.strictEqual(await h.cursor(), 0);
        });
    });

    describe('Tab / Shift+Tab', () => {
        it('リスト項目で Tab するとインデントされる', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, '- 項目1\n- 項目2\n');
            await h.setCursor(8);
            await h.press('Tab');
            assert.strictEqual(await h.doc(), '- 項目1\n\t- 項目2\n');
        });

        it('ネスト項目で Shift+Tab するとアウトデントされる', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, '- 項目1\n\t- 項目2\n');
            await h.setCursor(10);
            await h.press('Shift+Tab');
            assert.strictEqual(await h.doc(), '- 項目1\n- 項目2\n');
        });
    });
});
