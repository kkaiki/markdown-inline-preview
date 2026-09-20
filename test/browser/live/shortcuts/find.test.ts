/**
 * Live モードの ⌘F 検索（実 Chromium + 実 CodeMirror）。
 *
 * Live は custom editor（webview）なので、VS Code 標準の検索ウィジェットは出ない。
 * CodeMirror の検索パネルを keymap に載せて、⌘F で開き、Esc で閉じ、
 * 記法で隠れた文字（`**` など）も生ソースとして検索できることを固定する。
 *
 * 仕様: docs/specifications/live-mode/find.md
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openLive, type LiveHandle } from '../../liveBrowserHarness';

describe('Live モード: ⌘F 検索（実ブラウザ）', function () {
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

    const DOC = ['# 見出し', '', 'apple と **apple** と Apple', ''].join('\n');

    it('⌘F を押すと検索パネルが開き、入力欄にフォーカスが当たる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, DOC);
        await h.focus();
        await h.press('Meta+f');
        await h.page.waitForSelector('.cm-search input[name=search]', { timeout: 5000 });
        const focused = await h.page.evaluate(
            `document.activeElement && document.activeElement.getAttribute('name')`
        );
        assert.strictEqual(focused, 'search');
        assert.deepStrictEqual(h.errors, []);
    });

    it('検索語を入力すると一致箇所がハイライトされる（記法で隠れた部分も対象）', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, DOC);
        await h.focus();
        await h.press('Meta+f');
        await h.page.waitForSelector('.cm-search input[name=search]');
        await h.page.keyboard.type('apple');
        // 既定は大文字小文字を区別しない: apple / apple / Apple の 3 件
        await h.page.waitForSelector('.cm-searchMatch');
        const count = await h.page.locator('.cm-searchMatch').count();
        assert.ok(count >= 3, `一致箇所のハイライトが 3 件以上あるべき: ${count}`);
    });

    it('Enter で次の一致へ進み、文書の内容は変わらない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, DOC);
        await h.focus();
        await h.press('Meta+f');
        await h.page.waitForSelector('.cm-search input[name=search]');
        await h.page.keyboard.type('apple');
        await h.press('Enter');
        const sel = await h.page.locator('.cm-searchMatch-selected').count();
        assert.ok(sel >= 1, '選択中の一致箇所がハイライトされるべき');
        assert.strictEqual(await h.doc(), DOC);
    });

    it('Esc で検索パネルが閉じ、エディタへフォーカスが戻る', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, DOC);
        await h.focus();
        await h.press('Meta+f');
        await h.page.waitForSelector('.cm-search input[name=search]');
        await h.press('Escape');
        await h.page.waitForSelector('.cm-search', { state: 'detached', timeout: 5000 });
        const inEditor = await h.page.evaluate(
            `!!(document.activeElement && document.activeElement.closest('.cm-content'))`
        );
        assert.ok(inEditor, 'フォーカスがエディタ本文に戻るべき');
    });

    it('日本語ロケールでは検索パネルのラベルが日本語になる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, DOC, { locale: 'ja' });
        await h.focus();
        await h.press('Meta+f');
        await h.page.waitForSelector('.cm-search input[name=search]');
        const label = await h.page.locator('.cm-search button[name=next]').getAttribute('aria-label');
        assert.strictEqual(label, '次の一致項目');
    });

    describe('VS Code の検索ウィジェットと同じ構成', () => {
        /** ⌘F を開いて検索語を入力した状態にする。 */
        async function openAndType(handle: LiveHandle, text: string): Promise<void> {
            await handle.focus();
            await handle.press('Meta+f');
            await handle.page.waitForSelector('.cm-search input[name=search]');
            await handle.page.keyboard.type(text);
        }
        const count = (handle: LiveHandle): Promise<string | null> =>
            handle.page.locator('.cm-search .cm-find-count').textContent();

        it('検索欄・オプション（Aa / ab / .*）・件数・前へ/次へ・閉じるが並ぶ', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, DOC);
            await h.focus();
            await h.press('Meta+f');
            await h.page.waitForSelector('.cm-search input[name=search]');
            for (const sel of [
                'button[name=toggleReplace]',
                'input[name=search]',
                'button[name=case]',
                'button[name=word]',
                'button[name=regexp]',
                '.cm-find-count',
                'button[name=prev]',
                'button[name=next]',
                'button[name=close]'
            ]) {
                assert.strictEqual(await h.page.locator(`.cm-search ${sel}`).count(), 1, `${sel} が 1 つある`);
            }
        });

        it('オプションのボタンは検索欄の内側（右端）に置かれる', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, DOC);
            await h.focus();
            await h.press('Meta+f');
            await h.page.waitForSelector('.cm-search input[name=search]');
            const inside = await h.page.evaluate(`(() => {
                const input = document.querySelector('.cm-search input[name=search]').getBoundingClientRect();
                const btn = document.querySelector('.cm-search button[name=regexp]').getBoundingClientRect();
                return btn.left >= input.left && btn.right <= input.right + 1 && Math.abs(btn.top - input.top) < input.height;
            })()`);
            assert.strictEqual(inside, true);
        });

        it('検索語を入力すると「1 of 3」のように件数が出て、Enter で 2 of 3 へ進む', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, DOC);
            await openAndType(h, 'apple');
            assert.strictEqual(await count(h), '1 of 3');
            await h.press('Enter');
            assert.strictEqual(await count(h), '2 of 3');
            await h.press('Shift+Enter');
            assert.strictEqual(await count(h), '1 of 3');
        });

        it('一致が無いときは「No results」と出る', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, DOC);
            await openAndType(h, 'zzz');
            assert.strictEqual(await count(h), 'No results');
        });

        it('日本語ロケールでは件数表示も日本語になる', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, DOC, { locale: 'ja' });
            await openAndType(h, 'apple');
            assert.strictEqual(await count(h), '3 件中 1 件');
        });

        it('Aa（大文字小文字を区別）をオンにすると一致が絞られ、ボタンが押下状態になる', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, DOC);
            await openAndType(h, 'apple');
            await h.page.locator('.cm-search button[name=case]').click();
            assert.strictEqual(await count(h), '1 of 2');
            assert.strictEqual(await h.page.locator('.cm-search button[name=case]').getAttribute('aria-pressed'), 'true');
        });

        it('.*（正規表現）をオンにすると正規表現で検索できる', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, DOC);
            await openAndType(h, 'a.ple');
            assert.strictEqual(await count(h), 'No results');
            await h.page.locator('.cm-search button[name=regexp]').click();
            assert.strictEqual(await count(h), '1 of 3');
        });

        it('ab（単語単位）をオンにすると単語の一部にはヒットしない', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, 'app apple application\n');
            await openAndType(h, 'app');
            assert.strictEqual(await count(h), '1 of 3');
            await h.page.locator('.cm-search button[name=word]').click();
            assert.strictEqual(await count(h), '1 of 1');
        });

        it('置換欄は最初は隠れていて、左端の ⌄ で開閉できる', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, DOC);
            await h.focus();
            await h.press('Meta+f');
            await h.page.waitForSelector('.cm-search input[name=search]');
            assert.strictEqual(await h.page.locator('.cm-search input[name=replace]').isVisible(), false);
            await h.page.locator('.cm-search button[name=toggleReplace]').click();
            assert.strictEqual(await h.page.locator('.cm-search input[name=replace]').isVisible(), true);
            assert.strictEqual(
                await h.page.locator('.cm-search button[name=toggleReplace]').getAttribute('aria-expanded'),
                'true'
            );
        });

        it('置換欄でテキストを入れて「すべて置換」すると文書が書き換わる', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, DOC);
            await openAndType(h, 'apple');
            await h.page.locator('.cm-search button[name=toggleReplace]').click();
            await h.page.locator('.cm-search input[name=replace]').fill('pear');
            await h.page.locator('.cm-search button[name=replaceAll]').click();
            assert.strictEqual(await h.doc(), ['# 見出し', '', 'pear と **pear** と pear', ''].join('\n'));
        });

        it('「置換」は現在の一致を 1 件だけ置き換え、次の一致へ進む', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, DOC);
            await openAndType(h, 'apple');
            await h.page.locator('.cm-search button[name=toggleReplace]').click();
            await h.page.locator('.cm-search input[name=replace]').fill('pear');
            await h.page.locator('.cm-search button[name=replace]').click();
            assert.strictEqual(await h.doc(), ['# 見出し', '', 'pear と **apple** と Apple', ''].join('\n'));
            assert.strictEqual(await count(h), '1 of 2');
        });
    });

    describe('見た目（右上に浮かぶカード）', () => {
        /** 検索パネルの矩形とビューポート幅、最初の行の top を返す。 */
        interface Measured {
            panel: { left: number; right: number; top: number; width: number; height: number } | null;
            viewport: number;
            lineTop: number | null;
        }
        async function measure(handle: LiveHandle): Promise<Measured> {
            return handle.page.evaluate(`(() => {
                const panel = document.querySelector('.cm-panels-top');
                const r = panel ? panel.getBoundingClientRect() : null;
                const line = document.querySelector('.cm-line');
                return {
                    panel: r ? { left: r.left, right: r.right, top: r.top, width: r.width, height: r.height } : null,
                    viewport: window.innerWidth,
                    lineTop: line ? line.getBoundingClientRect().top : null
                };
            })()`);
        }

        it('検索パネルはエディタの右上に寄り、幅は狭いカードで、全幅バーにならない', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, DOC);
            await h.focus();
            await h.press('Meta+f');
            await h.page.waitForSelector('.cm-search input[name=search]');
            const m = await measure(h);
            assert.ok(m.panel, '検索パネルが存在するべき');
            assert.ok(m.panel.width <= 460, `幅は 460px 以下のカード: ${m.panel.width}`);
            assert.ok((m.panel.left + m.panel.right) / 2 > m.viewport / 2, `中心が右半分にある: left=${m.panel.left}`);
            assert.ok(m.viewport - m.panel.right <= 40, `右端に寄せる: 右余白=${m.viewport - m.panel.right}`);
        });

        it('検索パネルを開いても本文が下へずれない（本文の上に重ねて浮かぶ）', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, DOC);
            await h.focus();
            const before = await measure(h);
            await h.press('Meta+f');
            await h.page.waitForSelector('.cm-search input[name=search]');
            const after = await measure(h);
            assert.strictEqual(after.lineTop, before.lineTop);
        });

        it('ボタンは OS 標準のグレーの角ばった見た目ではなく、角丸のフラットなスタイル', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, DOC);
            await h.focus();
            await h.press('Meta+f');
            await h.page.waitForSelector('.cm-search input[name=search]');
            const style: { bg: string; radius: string; image: string } = await h.page.evaluate(`(() => {
                const b = document.querySelector('.cm-search button[name=next]');
                const cs = getComputedStyle(b);
                return { bg: cs.backgroundColor, radius: cs.borderTopLeftRadius, image: cs.backgroundImage };
            })()`);
            assert.notStrictEqual(style.radius, '0px', '角丸であるべき');
            assert.strictEqual(style.image, 'none', 'CodeMirror 既定のグラデーションを使わない');
            assert.notStrictEqual(style.bg, 'rgb(239, 239, 239)', 'OS 標準のボタン色のままにしない');
        });
    });
});
