/**
 * リスト・チェックボックス・引用の描画を実 Chromium で固定する。
 *
 * Obsidian 実測（obsidian-observed-spec.md §2.3〜§2.5）の要点:
 *   - 箇条書きの "-" と引用の ">" は**文字を消さず透明化して幅を残す**。
 *     したがって画面上の textContent には "-" や ">" が残っており、
 *     カーソルの桁もソースと 1:1 のままになる。
 *   - チェックボックスは "- [ ]" の5文字が `<input type=checkbox>` に置換され、
 *     カーソルがオフセット 0〜5 に入ったときだけ生テキストへ戻る。
 *
 * 受け入れ基準: requirements.md §6 #10（Home 2段階の前提となる "-" の実在）。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openLive, type LiveHandle } from '../../liveBrowserHarness';

describe('Live モード: リスト・引用・チェックボックスの描画（実ブラウザ）', function () {
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

    it('箇条書きの "-" は消さずに透明化する（カーソルが無くても文字は DOM に残る）', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '- 項目1\n\n本文\n');
        await h.setCursor(8);
        assert.strictEqual(await h.renderedLine(1), '- 項目1');
        const color = await h.page.evaluate(
            `getComputedStyle(document.querySelector('.cm-live-bullet')).color`
        );
        assert.strictEqual(color, 'rgba(0, 0, 0, 0)', '"-" が透明化されていない');
    });

    it('カーソルを箇条書き行に置いても表示は変わらない（常時変換）', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '- 項目1\n');
        const before = await h.renderedLine(1);
        await h.setCursor(0);
        assert.strictEqual(await h.renderedLine(1), before);
        await h.setCursor(1);
        assert.strictEqual(await h.renderedLine(1), before);
    });

    it('引用の ">" も透明化して残す', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '> 引用\n\n本文\n');
        await h.setCursor(7);
        assert.strictEqual(await h.renderedLine(1), '> 引用');
        const color = await h.page.evaluate(
            `getComputedStyle(document.querySelector('.cm-live-quote-marker')).color`
        );
        assert.strictEqual(color, 'rgba(0, 0, 0, 0)');
    });

    it('チェックボックスは "- [ ]" が input に置換される', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '- [ ] タスク\n\n本文\n');
        await h.setCursor(12);
        const count = await h.page.evaluate(`document.querySelectorAll('input.cm-live-checkbox').length`);
        assert.strictEqual(count, 1);
        assert.strictEqual(await h.renderedLine(1), ' タスク');
    });

    it('チェックボックスのトークン内（0〜5）にカーソルを置くと生テキストに戻る', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '- [ ] タスク\n');
        await h.setCursor(5);
        assert.strictEqual(await h.renderedLine(1), '- [ ] タスク');
        await h.setCursor(6);
        assert.strictEqual(await h.renderedLine(1), ' タスク');
    });

    it('チェックボックスをクリックするとソースの [ ] が [x] になる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '- [ ] タスク\n\n本文\n');
        await h.setCursor(12);
        await h.page.click('input.cm-live-checkbox');
        await h.page.waitForTimeout(200);
        assert.strictEqual(await h.doc(), '- [x] タスク\n\n本文\n');
    });

    it('チェック済みをクリックすると未チェックに戻る', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '- [x] タスク\n\n本文\n');
        await h.setCursor(12);
        await h.page.click('input.cm-live-checkbox');
        await h.page.waitForTimeout(200);
        assert.strictEqual(await h.doc(), '- [ ] タスク\n\n本文\n');
    });

    it('番号リストの数字はそのまま表示される', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '1. 番号1\n2. 番号2\n');
        assert.strictEqual(await h.renderedLine(2), '2. 番号2');
    });

    it('引用の中の太字も通常どおり収縮する', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '> **太字** の引用\n\n本文\n');
        await h.setCursor(16);
        assert.strictEqual(await h.renderedLine(1), '> 太字 の引用');
    });
});
