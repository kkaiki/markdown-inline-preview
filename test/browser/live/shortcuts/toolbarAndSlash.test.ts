/**
 * ツールバー・Notion 風ショートカット（⌥⌘数字）・スラッシュコマンドを
 * 実 Chromium で固定する。
 *
 * ユーザー要望（2026-08-05）:
 *   「画面上部に他の preview / raw などに切り替えられるツールバーが欲しい」
 *   「notion のショートカットキーのように option command number で入れられるようにして欲しい。またスラッシュコマンドなども」
 *
 * ブロック変換の対応表とスラッシュ項目は Raw / Preview と共通の定義を使うので、
 * ここでは「Live でも同じ操作ができる」ことを担保する。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openLive, type LiveHandle } from '../../liveBrowserHarness';

describe('Live モード: ツールバーとショートカット（実ブラウザ）', function () {
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

    describe('Notion 風ショートカット（⌥⌘数字）', () => {
        const cases: [string, string, string, string][] = [
            ['⌥⌘1 で見出し1', 'Meta+Alt+Digit1', '本文\n', '# 本文\n'],
            ['⌥⌘2 で見出し2', 'Meta+Alt+Digit2', '本文\n', '## 本文\n'],
            ['⌥⌘3 で見出し3', 'Meta+Alt+Digit3', '本文\n', '### 本文\n'],
            ['⌥⌘4 でチェックボックス', 'Meta+Alt+Digit4', '本文\n', '- [ ] 本文\n'],
            ['⌥⌘5 で箇条書き', 'Meta+Alt+Digit5', '本文\n', '- 本文\n'],
            ['⌥⌘6 で番号リスト', 'Meta+Alt+Digit6', '本文\n', '1. 本文\n'],
            ['⌥⌘9 で引用', 'Meta+Alt+Digit9', '本文\n', '> 本文\n'],
            ['⌥⌘0 で段落に戻す', 'Meta+Alt+Digit0', '## 本文\n', '本文\n']
        ];
        for (const [name, key, before, after] of cases) {
            it(name, async function () {
                if (!browser) { this.skip(); return; }
                h = await openLive(browser, before);
                await h.setCursor(before.length - 1);
                await h.press(key);
                assert.strictEqual(await h.doc(), after);
            });
        }

        it('種別をまたいでもプレフィックスが二重にならない', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, '- [ ] タスク\n');
            await h.setCursor(8);
            await h.press('Meta+Alt+Digit1');
            assert.strictEqual(await h.doc(), '# タスク\n');
        });

        it('複数行を選択すると全行に当たる', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, 'あ\nい\nう\n');
            await h.select(0, 5);
            await h.press('Meta+Alt+Digit5');
            assert.strictEqual(await h.doc(), '- あ\n- い\n- う\n');
        });
    });

    describe('ツールバー', () => {
        it('既定で表示され、モード切替ボタンがある', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, '本文\n');
            const labels = await h.page.evaluate<string[]>(
                `Array.from(document.querySelectorAll('.cm-live-toolbar-button')).map(b => b.textContent)`
            );
            assert.ok(labels.includes('H1'), `見出しボタンが無い: ${labels.join(',')}`);
            assert.ok(labels.includes('Preview'), 'Preview へ切り替えるボタンが無い');
            assert.ok(labels.includes('Raw'), 'Raw へ切り替えるボタンが無い');
        });

        it('現在のモードが Live と表示される', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, '本文\n');
            const cur = await h.page.evaluate<string>(
                `document.querySelector('.cm-live-toolbar-current').textContent`
            );
            assert.strictEqual(cur, 'Live');
        });

        it('H1 ボタンで見出しになる', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, '本文\n');
            await h.setCursor(2);
            await h.page.click('.cm-live-toolbar-button[title^="見出し1"]');
            await h.page.waitForTimeout(150);
            assert.strictEqual(await h.doc(), '# 本文\n');
        });

        it('B ボタンで選択を太字にする', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, 'abc def\n');
            await h.select(0, 3);
            await h.page.click('.cm-live-toolbar-button[title^="太字"]');
            await h.page.waitForTimeout(150);
            assert.strictEqual(await h.doc(), '**abc** def\n');
        });

        it('Preview ボタンで host へモード切替を送る', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, '本文\n');
            await h.page.click('.cm-live-toolbar-button[title^="Preview"]');
            await h.page.waitForTimeout(150);
            const sent = (await h.sent()).filter((m) => m.type === 'switchMode');
            assert.deepStrictEqual(sent, [{ type: 'switchMode', mode: 'preview' }]);
        });

        it('ツールバーを押してもエディタのフォーカスが外れない', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, '本文\n');
            await h.setCursor(2);
            await h.page.click('.cm-live-toolbar-button[title^="箇条書き"]');
            await h.page.waitForTimeout(150);
            const focused = await h.page.evaluate<boolean>(`window.__liveView.hasFocus`);
            assert.strictEqual(focused, true);
        });
    });

    describe('スラッシュコマンド', () => {
        it('"/" を打つとメニューが出る', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, '\n');
            await h.setCursor(0);
            await h.type('/');
            await h.page.waitForTimeout(300);
            const n = await h.page.evaluate<number>(
                `document.querySelectorAll('.cm-tooltip-autocomplete li').length`
            );
            assert.ok(n > 0, 'スラッシュメニューが出ていない');
        });

        it('絞り込むと候補が減る', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, '\n');
            await h.setCursor(0);
            await h.type('/tab');
            await h.page.waitForTimeout(300);
            const labels = await h.page.evaluate<string[]>(
                `Array.from(document.querySelectorAll('.cm-tooltip-autocomplete li')).map(e => e.textContent)`
            );
            assert.ok(
                labels.some((l) => l.includes('table')),
                `table が候補に無い: ${JSON.stringify(labels)}`
            );
        });

        it('Enter で選ぶと記法が挿入され "/" は残らない', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, '\n');
            await h.setCursor(0);
            await h.type('/h2');
            await h.page.waitForTimeout(300);
            await h.press('Enter');
            await h.page.waitForTimeout(200);
            assert.strictEqual(await h.doc(), '## \n');
        });

        it('URL の中の "/" では発火しない', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, '\n');
            await h.setCursor(0);
            await h.type('https:/');
            await h.page.waitForTimeout(300);
            const n = await h.page.evaluate<number>(
                `document.querySelectorAll('.cm-tooltip-autocomplete li').length`
            );
            assert.strictEqual(n, 0, 'URL の途中でメニューが出ている');
        });
    });
});
