/**
 * Live モード: インライン HTML（`<span style="…">…</span>` など）の描画を実 Chromium で固定する。
 *
 * 何を: 本文でも表のセルでも、許可したタグはタグ文字を隠して style 付きの要素として描き、
 *       カーソル（セルならフォーカス）が来たら生のタグに戻ること。危険な属性・タグは描かないこと。
 * なぜ: `<span style="background:#fff3bf;…">🟡 承認事項あり</span>` のようなバッジが、
 *       Live モードではタグごと文字として出ていた（表の中でも同じ）。
 * どの層で: 実際の色（computed style）とセルの DOM を見る必要があるので実ブラウザ。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openLive, type LiveHandle } from '../../liveBrowserHarness';

const BADGE =
    '<span style="background:#fff3bf;color:#e67700;padding:2px 8px;border-radius:10px;font-weight:bold;white-space:nowrap">🟡 承認事項あり</span>';

const BODY = `一行目\n\n状態: ${BADGE} です\n`;
const TABLE = `| 項目 | 状態 |\n| --- | --- |\n| 週報 | ${BADGE} |\n`;

async function focusCell(h: LiveHandle, index: number): Promise<void> {
    await h.page.evaluate((i: number) => {
        const cells = Array.from(document.querySelectorAll('.cm-live-table [contenteditable="true"]'));
        const cell = cells[i] as HTMLElement;
        cell.focus();
        const range = document.createRange();
        range.selectNodeContents(cell);
        range.collapse(false);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
    }, index);
    await h.page.waitForTimeout(100);
}

/** 描画されたバッジ要素の見た目。無ければ null。 */
async function badgeStyle(
    h: LiveHandle,
    scope: string
): Promise<{ text: string; color: string; background: string; weight: string } | null> {
    return h.page.evaluate((sel: string) => {
        const el = Array.from(document.querySelectorAll<HTMLElement>(`${sel} .cm-live-html`)).find((e) =>
            (e.textContent ?? '').includes('承認事項あり')
        );
        if (!el) return null;
        const cs = getComputedStyle(el);
        return { text: el.textContent ?? '', color: cs.color, background: cs.backgroundColor, weight: cs.fontWeight };
    }, scope);
}

describe('Live モード: インライン HTML の描画（実ブラウザ）', function () {
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
            await h.close();
            h = undefined;
        }
    });

    describe('本文', () => {
        it('カーソルが外にあるとき、span はタグを隠して style 付きのバッジとして描かれる', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, BODY);
            await h.setCursor(0);
            assert.strictEqual(await h.renderedLine(3), '状態: 🟡 承認事項あり です');
            const s = await badgeStyle(h, '.cm-content');
            assert.ok(s, 'バッジ要素が描かれていない');
            assert.strictEqual(s.color, 'rgb(230, 119, 0)');
            assert.strictEqual(s.background, 'rgb(255, 243, 191)');
            assert.strictEqual(s.weight, '700');
        });

        it('カーソルをタグの中に置くと生の HTML に戻る', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, BODY);
            await h.setCursor(BODY.indexOf('承認'));
            assert.strictEqual(await h.renderedLine(3), `状態: ${BADGE} です`);
        });

        it('フォーカスを外すと再びバッジとして描かれる', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, BODY);
            await h.setCursor(BODY.indexOf('承認'));
            await h.blur();
            assert.strictEqual(await h.renderedLine(3), '状態: 🟡 承認事項あり です');
        });

        it('描画しても文書のソースは変わらない', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, BODY);
            await h.setCursor(0);
            assert.strictEqual(await h.doc(), BODY);
        });

        it('onclick や url() は DOM に持ち込まれない', async function () {
            if (!browser) { this.skip(); return; }
            const doc = 'a\n\n<span onclick="window.__clicked=1" style="background:url(https://example.invalid/x.png);color:red">危険</span>\n';
            h = await openLive(browser, doc);
            await h.setCursor(0);
            const info = await h.page.evaluate(() => {
                const el = document.querySelector<HTMLElement>('.cm-content .cm-live-html');
                return el
                    ? { onclick: el.getAttribute('onclick'), style: el.getAttribute('style') ?? '', text: el.textContent }
                    : null;
            });
            assert.ok(info, 'span が描かれていない');
            assert.strictEqual(info.onclick, null);
            assert.strictEqual(info.style.includes('url('), false, info.style);
            assert.strictEqual(info.text, '危険');
        });

        it('script タグは描画せず文字のまま見える', async function () {
            if (!browser) { this.skip(); return; }
            const doc = 'a\n\n<script>window.__pwned=1</script>\n';
            h = await openLive(browser, doc);
            await h.setCursor(0);
            assert.strictEqual(await h.renderedLine(3), '<script>window.__pwned=1</script>');
            assert.strictEqual(await h.page.evaluate('window.__pwned === undefined'), true);
        });
    });

    describe('表のセル', () => {
        it('セルの中の span もタグを隠して style 付きのバッジとして描かれる', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, TABLE);
            const text = await h.page.evaluate<string>(
                `document.querySelectorAll('.cm-live-table [contenteditable="true"]')[3].textContent`
            );
            assert.strictEqual(text, '🟡 承認事項あり');
            const s = await badgeStyle(h, '.cm-live-table');
            assert.ok(s, 'セルの中にバッジ要素が描かれていない');
            assert.strictEqual(s.color, 'rgb(230, 119, 0)');
            assert.strictEqual(s.background, 'rgb(255, 243, 191)');
        });

        it('セルにフォーカスすると生の HTML に戻り、外すと再びバッジになる', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, TABLE);
            await focusCell(h, 3);
            assert.strictEqual(
                await h.page.evaluate<string>(
                    `document.querySelectorAll('.cm-live-table [contenteditable="true"]')[3].textContent`
                ),
                BADGE
            );
            await focusCell(h, 2);
            assert.strictEqual(
                await h.page.evaluate<string>(
                    `document.querySelectorAll('.cm-live-table [contenteditable="true"]')[3].textContent`
                ),
                '🟡 承認事項あり'
            );
            assert.strictEqual(await h.doc(), TABLE, '表のソースが変わってしまった');
        });
    });
});
