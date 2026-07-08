/**
 * 実ブラウザ回帰テスト: コードフェンスの言語名を自由テキストとして編集できること。
 *
 * ## 背景
 *
 * コードフェンス（`` ```lang `` 〜 `` ``` ``）のバッククォート自体は、実テキスト化すると
 * 直列化（保存）時にコード本文へ紛れ込む恐れがあるため widget 表示のまま編集不可にしている
 * （`code-fence-focus-markers.md`）。一方、言語名部分は `code_block` ノードの `language`
 * 属性であり、内容テキストとは別管理なので実テキスト化のリスクが無い。
 *
 * 以前から `codeLanguagePlugin`（フォーカス中にブロック右上へ浮かぶ言語セレクタ）が
 * 存在したが、`<select>` で固定リストからしか選べず、自由な文字列への打ち替え・
 * Backspace による編集ができなかった。`<input>`（`<datalist>` でリストを提案）へ
 * 変更し、キー入力のたびに `code_block` の `language` 属性へ反映するようにした
 * （`code-fence-language-focus-edit-fix.md` 参照）。
 *
 * 実行: `npm run test:browser`。ブラウザが無い環境では skip。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openPreview, type PreviewHandle } from '../previewBrowserHarness';

describe('実ブラウザ: コードフェンス言語名の自由テキスト編集', function () {
    this.timeout(120000);

    let browser: Browser | null = null;
    let h: PreviewHandle | undefined;

    before(async () => { browser = await launchBrowser(); });
    after(async function () {
        this.timeout(60000);
        await Promise.race([
            browser?.close(),
            new Promise<void>(resolve => setTimeout(resolve, 55000))
        ]);
    });
    afterEach(async () => { if (h) { await h.close(); h = undefined; } });

    async function languageAttr(handle: PreviewHandle): Promise<string | null> {
        return handle.page.evaluate(() => {
            const view = (window as unknown as { __view: { state: { doc: { descendants: (fn: (n: unknown, p: number) => void) => void } } } }).__view;
            let lang: string | null = null;
            view.state.doc.descendants((n) => {
                const node = n as { type: { name: string }; attrs: Record<string, unknown> };
                if (node.type.name === 'code_block') lang = typeof node.attrs.language === 'string' ? node.attrs.language : '';
            });
            return lang;
        });
    }

    it('コードブロックにフォーカスすると言語欄が <input> として表示される（<select> ではない）', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '```js\nconst x = 1;\n```\n\n段落テキスト\n', '段落テキスト');
        await h.placeCursorAfterText('const x = 1;');
        await h.page.waitForTimeout(200);

        const tag = await h.page.evaluate(() => {
            const el = document.querySelector('.code-lang-select input');
            return el ? el.tagName : null;
        });
        assert.strictEqual(tag, 'INPUT', '言語欄が <input> になっていない');
        assert.deepStrictEqual(h.errors, []);
    });

    it('言語欄にプリセットに無い文字列を打つと、そのまま code_block の language 属性になる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '```js\nconst x = 1;\n```\n\n段落テキスト\n', '段落テキスト');
        await h.placeCursorAfterText('const x = 1;');
        await h.page.waitForTimeout(200);

        await h.page.click('.code-lang-select input');
        await h.page.keyboard.press('Meta+A');
        await h.page.keyboard.type('mylang', { delay: 30 });
        await h.page.waitForTimeout(150);

        assert.strictEqual(await languageAttr(h), 'mylang', '自由入力した言語名が反映されていない');
        assert.deepStrictEqual(h.errors, []);
    });

    it('言語欄で Backspace すると1文字ずつ削除でき、それに応じて language 属性が更新される', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '```javascript\nconst x = 1;\n```\n\n段落テキスト\n', '段落テキスト');
        await h.placeCursorAfterText('const x = 1;');
        await h.page.waitForTimeout(200);

        await h.page.click('.code-lang-select input');
        // 末尾にカーソルを置いてから2文字 Backspace
        await h.page.keyboard.press('End');
        await h.page.keyboard.press('Backspace');
        await h.page.keyboard.press('Backspace');
        await h.page.waitForTimeout(150);

        assert.strictEqual(await languageAttr(h), 'javascri', 'Backspace 後の言語名が期待と違う');
        assert.deepStrictEqual(h.errors, []);
    });

    it('言語欄には既知の言語一覧が <datalist> の候補として提案される', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '```js\nconst x = 1;\n```\n\n段落テキスト\n', '段落テキスト');
        await h.placeCursorAfterText('const x = 1;');
        await h.page.waitForTimeout(200);

        const options = await h.page.evaluate(() => {
            const input = document.querySelector<HTMLInputElement>('.code-lang-select input');
            if (!input) return null;
            const listId = input.getAttribute('list');
            const datalist = listId ? document.getElementById(listId) : null;
            if (!datalist) return null;
            return Array.from(datalist.querySelectorAll('option')).map(o => o.getAttribute('value'));
        });
        assert.ok(options && options.includes('python') && options.includes('typescript'),
            `既知言語の候補が無い: ${JSON.stringify(options)}`);
        assert.deepStrictEqual(h.errors, []);
    });
});
