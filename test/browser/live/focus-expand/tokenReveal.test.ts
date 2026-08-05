/**
 * Live モードの「カーソル位置で記法が出入りする」挙動を、実 Chromium の実 DOM で固定する。
 *
 * 期待値は Obsidian 1.13.4 の実測（obsidian-observed-spec.md §1・§2）そのまま。
 * 純関数テスト（test/suite/live/focus-expand/revealScope.test.ts）は判定式を守るが、
 * 「本当に DOM から文字が消えているか」はここでしか分からない。
 *
 * 受け入れ基準: requirements.md §6 の必須回帰テスト #2（トークン境界）#3（blur で全収縮）。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openLive, type LiveHandle } from '../../liveBrowserHarness';

/** 実測に使ったのと同じ行。オフセットも実測値と一致する。 */
const LINE = 'これは **太字bold** と *斜体italic* と ***太字斜体*** の行です。';
const COLLAPSED = 'これは 太字bold と 斜体italic と 太字斜体 の行です。';

describe('Live モード: カーソル位置による記法の展開/収縮（実ブラウザ）', function () {
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

    it('カーソルが無い行では記法文字が DOM から消える', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, `${LINE}\n\n別の段落\n`);
        await h.setCursor(LINE.length + 2); // 別の行へ
        assert.strictEqual(await h.renderedLine(1), COLLAPSED);
    });

    it('太字トークンの内側にカーソルを置くとその太字だけ展開する', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, `${LINE}\n`);
        await h.setCursor(8);
        assert.strictEqual(
            await h.renderedLine(1),
            'これは **太字bold** と 斜体italic と 太字斜体 の行です。'
        );
    });

    it('トークンの1つ手前（from-1）では展開しない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, `${LINE}\n`);
        await h.setCursor(3);
        assert.strictEqual(await h.renderedLine(1), COLLAPSED);
    });

    it('トークンの開始位置（from）では展開する', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, `${LINE}\n`);
        await h.setCursor(4);
        assert.ok((await h.renderedLine(1)).includes('**太字bold**'));
    });

    it('閉じ記号の直後（to）でも展開する', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, `${LINE}\n`);
        await h.setCursor(14);
        assert.ok((await h.renderedLine(1)).includes('**太字bold**'));
    });

    it('to の1つ先（to+1）では収縮に戻る', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, `${LINE}\n`);
        await h.setCursor(15);
        assert.strictEqual(await h.renderedLine(1), COLLAPSED);
    });

    it('見出しは行のどこにカーソルがあっても "# " が出る（行スコープ）', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '# 見出し1 Heading One\n\n本文\n');
        for (const off of [0, 2, 8, 18]) { // 18 = '# 見出し1 Heading One' の行末
            await h.setCursor(off);
            assert.strictEqual(
                await h.renderedLine(1),
                '# 見出し1 Heading One',
                `offset ${off} で "# " が出ていない`
            );
        }
    });

    it('見出し行を離れると "# " が消える', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '# 見出し1\n\n本文\n');
        await h.setCursor(8); // 3行目
        assert.strictEqual(await h.renderedLine(1), '見出し1');
    });

    it('blur すると展開していた記法がすべて収縮する', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '# 見出し1\n');
        await h.setCursor(2);
        assert.strictEqual(await h.renderedLine(1), '# 見出し1');
        await h.blur();
        assert.strictEqual(await h.renderedLine(1), '見出し1');
    });

    it('選択が複数のトークンにまたがると、またいだものはすべて展開する', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, `${LINE}\n`);
        await h.select(0, 30);
        const rendered = await h.renderedLine(1);
        assert.ok(rendered.includes('**太字bold**'), `太字が展開されていない: ${rendered}`);
        assert.ok(rendered.includes('*斜体italic*'), `斜体が展開されていない: ${rendered}`);
    });

    it('リンクは収縮時に URL が消えて表示テキストだけになる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, 'x [表示](https://example.com) y\n\nz\n');
        await h.setCursor(31); // 3行目 'z'
        assert.strictEqual(await h.renderedLine(1), 'x 表示 y');
    });

    it('コードフェンスの中の "**" は展開対象にならない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '```\n**not bold**\n```\n');
        await h.setCursor(0);
        assert.strictEqual(await h.renderedLine(2), '**not bold**');
    });
});
