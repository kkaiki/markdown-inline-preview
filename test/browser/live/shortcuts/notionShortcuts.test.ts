/**
 * Notion 準拠のショートカットが Live モード（実 Chromium + 実 CodeMirror）で
 * 実際にキーとして届き、期待どおりの Markdown になることを固定する。
 *
 * 文字列の組み立て自体は純関数（test/suite/shared/inlineFormat・blockOps）で
 * 網羅済みなので、ここで守るのは「そのキーが CodeMirror の keymap に届くか」
 * 「カーソル・選択が期待の位置に残るか」という実環境側の性質。
 *
 * 仕様: docs/specifications/notion-shortcuts.md
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openLive, type LiveHandle } from '../../liveBrowserHarness';

describe('Live モード: Notion 準拠のショートカット（実ブラウザ）', function () {
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

    describe('インライン書式', () => {
        const cases: [string, string, string][] = [
            ['⌘B で選択が太字になる', 'Meta+b', '**選択**\n'],
            ['⌘I で選択が斜体になる', 'Meta+i', '*選択*\n'],
            ['⌘U で選択が <u> で囲まれる', 'Meta+u', '<u>選択</u>\n'],
            ['⌘E で選択がインラインコードになる', 'Meta+e', '`選択`\n'],
            ['⌘⇧S で選択が取り消し線になる', 'Meta+Shift+s', '~~選択~~\n'],
            ['⌘⇧H で選択がハイライトになる', 'Meta+Shift+h', '==選択==\n'],
            ['⌘⇧M で選択が HTML コメントになる', 'Meta+Shift+m', '<!-- 選択 -->\n']
        ];
        for (const [name, key, expected] of cases) {
            it(name, async function () {
                if (!browser) { this.skip(); return; }
                h = await openLive(browser, '選択\n');
                await h.select(0, 2);
                await h.press(key);
                assert.strictEqual(await h.doc(), expected);
            });
        }

        it('⌘B をもう一度押すと太字が外れる', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, '選択\n');
            await h.select(0, 2);
            await h.press('Meta+b');
            await h.press('Meta+b');
            assert.strictEqual(await h.doc(), '選択\n');
        });

        it('⌘K でリンクになり、カーソルは URL を打つ位置に入る', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, 'リンク\n');
            await h.select(0, 3);
            await h.press('Meta+k');
            assert.strictEqual(await h.doc(), '[リンク]()\n');
            // "[リンク](" の直後 = 6 文字目
            assert.strictEqual(await h.cursor(), 6);
        });

        it('選択せずに ⌘B を押すと ** だけ入りカーソルは中に入る', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, '\n');
            await h.setCursor(0);
            await h.press('Meta+b');
            assert.strictEqual(await h.doc(), '****\n');
            assert.strictEqual(await h.cursor(), 2);
        });
    });

    describe('ブロック変換', () => {
        it('⌥⌘7 でトグルリスト（details）になる', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, 'たたむ\n');
            await h.setCursor(3);
            await h.press('Meta+Alt+Digit7');
            assert.strictEqual(
                await h.doc(),
                '<details>\n<summary>たたむ</summary>\n\n\n</details>\n'
            );
        });

        it('⌥⌘8 でコードブロックになる', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, 'code\n');
            await h.setCursor(4);
            await h.press('Meta+Alt+Digit8');
            assert.strictEqual(await h.doc(), '```\ncode\n```\n');
        });
    });

    describe('ブロック操作', () => {
        it('⌘D でカーソル行が複製される', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, '- 項目A\n- 項目B\n');
            await h.setCursor(1);
            await h.press('Meta+d');
            assert.strictEqual(await h.doc(), '- 項目A\n- 項目A\n- 項目B\n');
        });

        it('⌘D は子項目も一緒に複製する', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, '- 親\n  - 子\n');
            await h.setCursor(1);
            await h.press('Meta+d');
            assert.strictEqual(await h.doc(), '- 親\n  - 子\n- 親\n  - 子\n');
        });

        it('⌘⇧↓ で行が下へ移動する', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, 'あ\nい\n');
            await h.setCursor(0);
            await h.press('Meta+Shift+ArrowDown');
            assert.strictEqual(await h.doc(), 'い\nあ\n');
        });

        it('⌘⇧↑ で行が上へ移動する', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, 'あ\nい\n');
            await h.setCursor(2);
            await h.press('Meta+Shift+ArrowUp');
            assert.strictEqual(await h.doc(), 'い\nあ\n');
        });

        it('先頭行で ⌘⇧↑ を押しても文書は変わらない', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, 'あ\nい\n');
            await h.setCursor(0);
            await h.press('Meta+Shift+ArrowUp');
            assert.strictEqual(await h.doc(), 'あ\nい\n');
        });

        it('⌘Enter でチェックボックスが切り替わる', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, '- [ ] やること\n');
            await h.setCursor(10);
            await h.press('Meta+Enter');
            assert.strictEqual(await h.doc(), '- [x] やること\n');
            await h.press('Meta+Enter');
            assert.strictEqual(await h.doc(), '- [ ] やること\n');
        });

        it('⌘Enter は普通の箇条書きをチェックボックスに変える', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, '- 項目\n');
            await h.setCursor(4);
            await h.press('Meta+Enter');
            assert.strictEqual(await h.doc(), '- [ ] 項目\n');
        });
    });

    describe('⇧Enter（ブロック内改行）', () => {
        it('リスト項目の行末で ⇧Enter するとマーカーを継続しない', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, '- 項目\n');
            await h.setCursor(4);
            await h.press('Shift+Enter');
            assert.strictEqual(await h.doc(), '- 項目\n\n');
        });

        it('素の Enter はこれまでどおりマーカーを継続する', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, '- 項目\n');
            await h.setCursor(4);
            await h.press('Enter');
            assert.strictEqual(await h.doc(), '- 項目\n- \n');
        });
    });

    describe('モード切替', () => {
        it('⌘⇧. を押すと host へ Raw への切り替えを依頼する', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, '本文\n');
            await h.setCursor(2);
            await h.press('Meta+Shift+Period');
            const sent = await h.sent();
            assert.ok(
                sent.some((m) => m.type === 'switchMode' && m.mode === 'raw'),
                `switchMode が送られていない: ${JSON.stringify(sent)}`
            );
        });
    });
});
