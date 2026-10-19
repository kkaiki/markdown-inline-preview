/**
 * Live モードの目次ドロワーを実 Chromium で固定する。
 *
 * GitHub issue #5（2026-10-15）: 長い md を見出しで移動したい。設計は
 * `docs/specifications/live-mode/outline-drawer-design.md`。
 * 既定は閉じていて、ツールバー左端の ☰ で開閉する。左に出し、幅が広ければ本文を押し出し、狭ければ重ねる。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openLive, type LiveHandle } from '../../liveBrowserHarness';

const MENU = '.cm-live-toolbar-button[data-outline="toggle"]';
const DRAWER = '.cm-live-outline';
const ITEM = '.cm-live-outline-item';

/** 見出しが並んだ長い文書。 */
function longDoc(): string {
    const parts: string[] = [];
    for (let s = 1; s <= 6; s++) {
        parts.push(`# 章${s}`);
        for (let i = 0; i < 25; i++) parts.push(`章${s} の本文 ${i}`);
        parts.push(`## 節${s}`);
        for (let i = 0; i < 25; i++) parts.push(`節${s} の本文 ${i}`);
    }
    return parts.join('\n') + '\n';
}

async function isOpen(h: LiveHandle): Promise<boolean> {
    return h.page.evaluate<boolean>(`(() => {
        const d = document.querySelector('${DRAWER}');
        return !!d && !d.hidden && d.getBoundingClientRect().width > 0;
    })()`);
}

async function itemTexts(h: LiveHandle): Promise<string[]> {
    return h.page.evaluate<string[]>(`[...document.querySelectorAll('${ITEM}')].map(e => e.textContent)`);
}

describe('Live モード: 目次ドロワー（実ブラウザ）', function () {
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

    it('既定では閉じていて、ツールバーの左端に ☰ がある', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '# A\n本文\n');
        assert.strictEqual(await isOpen(h), false);
        const first = await h.page.evaluate<string | null>(
            `document.querySelector('.cm-live-toolbar-button')?.dataset.outline ?? null`
        );
        assert.strictEqual(first, 'toggle', 'ツールバーの先頭が ☰ ではない');
        assert.strictEqual(await h.page.getAttribute(MENU, 'aria-expanded'), 'false');
    });

    it('☰ を押すと左に開いて見出しが並び、もう一度押すと閉じる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '# A\n本文\n## B\n### C\n#### D\n');
        await h.page.click(MENU);
        await h.page.waitForTimeout(150);
        assert.strictEqual(await isOpen(h), true);
        assert.strictEqual(await h.page.getAttribute(MENU, 'aria-expanded'), 'true');
        assert.deepStrictEqual(await itemTexts(h), ['A', 'B', 'C']);
        const drawer = await h.page.locator(DRAWER).boundingBox();
        const editor = await h.page.locator('.cm-editor').boundingBox();
        assert.ok(drawer && editor && drawer.x < editor.x, '目次が本文の左にない');
        await h.page.click(MENU);
        await h.page.waitForTimeout(150);
        assert.strictEqual(await isOpen(h), false);
    });

    it('幅が広いときは本文を押し出す（重ならない）', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '# A\n本文\n');
        await h.page.setViewportSize({ width: 1200, height: 700 });
        await h.page.click(MENU);
        await h.page.waitForTimeout(150);
        const drawer = await h.page.locator(DRAWER).boundingBox();
        const editor = await h.page.locator('.cm-editor').boundingBox();
        assert.ok(drawer && editor && drawer.x + drawer.width <= editor.x + 1, '本文と重なっている');
    });

    it('狭いときは本文に重ねて出し、見出しを押すと閉じる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '# A\n本文\n## B\n');
        await h.page.setViewportSize({ width: 600, height: 600 });
        await h.page.click(MENU);
        await h.page.waitForTimeout(150);
        const editor = await h.page.locator('.cm-editor').boundingBox();
        assert.ok(editor && editor.x < 10, '狭いのに本文が押し出されている');
        await h.page.locator(ITEM, { hasText: 'B' }).click();
        await h.page.waitForTimeout(200);
        assert.strictEqual(await isOpen(h), false);
    });

    it('狭いとき（重ね型）は、本文など目次の外を押すと閉じる', async function () {
        // ユーザー要望（2026-10-19）: 他の場所をクリックしたら目次を閉じる（重ね型だけ。案 A）
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '# A\n本文\n## B\n' + '行\n'.repeat(30));
        await h.page.setViewportSize({ width: 600, height: 600 });
        await h.page.click(MENU);
        await h.page.waitForTimeout(150);
        assert.strictEqual(await isOpen(h), true);
        await h.page.mouse.click(500, 400); // 目次（幅 240px）の右の本文
        await h.page.waitForTimeout(150);
        assert.strictEqual(await isOpen(h), false);
        assert.strictEqual(await h.page.getAttribute(MENU, 'aria-expanded'), 'false');
    });

    it('狭いときでも、☰ を押したら閉じたあと開き直さない（外側クリックと ☰ が二重に効かない）', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '# A\n本文\n');
        await h.page.setViewportSize({ width: 600, height: 600 });
        await h.page.click(MENU);
        await h.page.waitForTimeout(150);
        await h.page.click(MENU);
        await h.page.waitForTimeout(150);
        assert.strictEqual(await isOpen(h), false);
    });

    it('幅が広いとき（押し出し型）は、本文を押しても閉じない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '# A\n本文\n## B\n' + '行\n'.repeat(30));
        await h.page.setViewportSize({ width: 1200, height: 600 });
        await h.page.click(MENU);
        await h.page.waitForTimeout(150);
        await h.page.mouse.click(800, 300);
        await h.page.waitForTimeout(150);
        assert.strictEqual(await isOpen(h), true);
    });

    it('見出しを押すと、その見出しまでスクロールし、カーソルが見出しの行末に来てエディタにフォーカスが戻る', async function () {
        if (!browser) { this.skip(); return; }
        const doc = longDoc();
        h = await openLive(browser, doc);
        await h.page.setViewportSize({ width: 1200, height: 600 });
        await h.page.click(MENU);
        await h.page.locator(ITEM, { hasText: '節5' }).click();
        await h.page.waitForTimeout(300);
        const head = await h.page.evaluate<number>('window.__liveView.state.selection.main.head');
        const lineEnd = doc.indexOf('## 節5') + '## 節5'.length;
        assert.strictEqual(head, lineEnd);
        assert.strictEqual(await h.page.evaluate<boolean>('window.__liveView.hasFocus'), true);
        const top = await h.page.evaluate<number>(`(() => {
            const v = window.__liveView;
            const r = v.coordsAtPos(${lineEnd});
            return r ? r.top - v.scrollDOM.getBoundingClientRect().top : -9999;
        })()`);
        assert.ok(top >= 0 && top < 120, `見出しが画面の上の方に来ていない: ${top}`);
    });

    it('スクロールすると、今読んでいる節の見出しがハイライトされる', async function () {
        if (!browser) { this.skip(); return; }
        const doc = longDoc();
        h = await openLive(browser, doc);
        await h.page.setViewportSize({ width: 1200, height: 600 });
        await h.page.click(MENU);
        await h.page.evaluate(`(() => {
            const v = window.__liveView;
            v.scrollDOM.scrollTop = v.lineBlockAt(${doc.indexOf('## 節3') + 5}).top;
        })()`);
        await h.page.waitForTimeout(400);
        const current = await h.page.evaluate<string[]>(
            `[...document.querySelectorAll('${ITEM}[aria-current="true"]')].map(e => e.textContent)`
        );
        assert.deepStrictEqual(current, ['節3']);
    });

    it('文書を編集すると目次も変わる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '# A\n本文\n');
        await h.page.click(MENU);
        await h.setCursor(await h.doc().then((d) => d.length));
        await h.type('## 新しい節');
        await h.page.waitForTimeout(600);
        assert.deepStrictEqual(await itemTexts(h), ['A', '新しい節']);
    });

    it('VS Code のサイドバーが暗い色でも、目次の文字は本文と同じ配色で読める（コントラスト 4.5 以上）', async function () {
        // 実機（2026-10-17）: Cursor のサイドバーが濃紺で、本文は明るい配色のとき、目次が濃紺に濃い灰色の文字で読めなかった
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '# 見出し\n本文\n');
        await h.page.addStyleTag({ content: ':root{--vscode-sideBar-background:#050a1f}' });
        await h.page.click(MENU);
        await h.page.waitForTimeout(150);
        const ratio = await h.page.evaluate<number>(`(() => {
            const parse = (c) => c.match(/[\\d.]+/g).slice(0, 3).map(Number);
            const lum = ([r, g, b]) => {
                const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
                return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
            };
            const item = document.querySelector('${ITEM}');
            const fg = lum(parse(getComputedStyle(item).color));
            const bg = lum(parse(getComputedStyle(document.querySelector('${DRAWER}')).backgroundColor));
            return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
        })()`);
        assert.ok(ratio >= 4.5, `目次の文字と背景のコントラストが足りない: ${ratio.toFixed(2)}`);
    });

    it('見出しが無ければ「見出しがありません」と出る', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '本文だけ\n');
        await h.page.click(MENU);
        await h.page.waitForTimeout(150);
        assert.strictEqual((await h.page.locator('.cm-live-outline-empty').textContent())?.trim(), 'No headings');
    });

    it('目次の上で ↓ と Enter で移動でき、Esc で閉じてエディタへ戻る', async function () {
        if (!browser) { this.skip(); return; }
        const doc = '# A\n本文\n## B\n本文\n';
        h = await openLive(browser, doc);
        await h.page.setViewportSize({ width: 1200, height: 600 });
        await h.page.click(MENU);
        await h.page.locator(ITEM).first().focus();
        await h.page.keyboard.press('ArrowDown');
        await h.page.keyboard.press('Enter');
        await h.page.waitForTimeout(200);
        const head = await h.page.evaluate<number>('window.__liveView.state.selection.main.head');
        assert.strictEqual(head, doc.indexOf('## B') + 4);
        await h.page.locator(ITEM).first().focus();
        await h.page.keyboard.press('Escape');
        await h.page.waitForTimeout(150);
        assert.strictEqual(await isOpen(h), false);
        assert.strictEqual(await h.page.evaluate<boolean>('window.__liveView.hasFocus'), true);
    });
});
