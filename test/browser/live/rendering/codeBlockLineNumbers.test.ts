/**
 * Live モードで、コードブロックの**中**に行番号を出せること（設定 `markdownInline.live.codeBlockLineNumbers`）。
 *
 * 要望（GitHub イシュー #2）:「ファイルのプレビューの、コードブロックの中に行番号を出せるとうれしい」。
 * 既存の `live.showLineNumbers` はエディタ全体の行番号の列で、コードブロックの中の 1 から始まる番号ではない。
 *
 * 守ること:
 *   - 既定（設定なし）では出さない（今までの見た目を変えない）
 *   - 出すときは、フェンス（``` の行）を除いた中身の行に、ブロックごとに 1 から振る
 *   - 番号は文書の中身ではない（選択・コピー・保存される Markdown に混ざらない）
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openLive, type LiveHandle } from '../../liveBrowserHarness';

const DOC = [
    '前置き',
    '',
    '```js',
    'const a = 1;',
    'const b = 2;',
    'const c = 3;',
    '```',
    '',
    '間の文',
    '',
    '```',
    'second block',
    '```',
    ''
].join('\n');

describe('Live モード: コードブロックの行番号（実ブラウザ）', function () {
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

    async function numbers(handle: LiveHandle): Promise<string[]> {
        return handle.page.evaluate(() =>
            Array.from(document.querySelectorAll('.cm-live-code-ln')).map((e) => (e.textContent ?? '').trim())
        );
    }

    it('既定（設定なし）では、コードブロックに行番号を出さない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, DOC);
        assert.deepStrictEqual(await numbers(h), []);
    });

    it('有効にすると、フェンスを除いた中身の行に、ブロックごとに 1 から振る', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, DOC, { showLineNumbers: false, codeBlockLineNumbers: true });
        assert.deepStrictEqual(await numbers(h), ['1', '2', '3', '1']);
    });

    it('番号は文書の中身ではない: 保存される Markdown は変わらず、番号は選択・コピーの対象にならない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, DOC, { showLineNumbers: false, codeBlockLineNumbers: true });
        assert.strictEqual(await h.doc(), DOC);
        const selectable = await h.page.evaluate(() => {
            const el = document.querySelector('.cm-live-code-ln');
            return el ? getComputedStyle(el).userSelect : null;
        });
        assert.strictEqual(selectable, 'none');
    });

    it('コードの中でカーソルを動かして文字を打っても、番号は崩れない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, DOC, { showLineNumbers: false, codeBlockLineNumbers: true });
        const at = DOC.indexOf('const b') + 7;
        await h.setCursor(at);
        await h.page.keyboard.type('X');
        assert.ok((await h.doc()).includes('const bX = 2;'));
        assert.deepStrictEqual(await numbers(h), ['1', '2', '3', '1']);
    });

    it('コードの行を増やすと、番号も増える', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, DOC, { showLineNumbers: false, codeBlockLineNumbers: true });
        await h.setCursor(DOC.indexOf('const c = 3;') + 'const c = 3;'.length);
        await h.page.keyboard.press('Enter');
        await h.page.keyboard.type('const d = 4;');
        assert.deepStrictEqual(await numbers(h), ['1', '2', '3', '4', '1']);
    });

    it('エラーが出ない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, DOC, { showLineNumbers: false, codeBlockLineNumbers: true });
        assert.deepStrictEqual(h.errors, []);
    });
});
