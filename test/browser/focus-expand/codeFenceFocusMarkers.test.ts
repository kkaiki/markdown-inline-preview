/**
 * 実ブラウザ回帰テスト: コードフェンス（```lang` / ```` ``` ````）の focus-expand。
 *
 * 見出し（`## `）やインライン記法（`**` `` ` ``）は、フォーカスが中にあるあいだ
 * `focusSyntaxPlugin` が Markdown 記法（マーカー）を widget decoration として表示する
 * （Obsidian の Live Preview と同様）。フェンスコードブロック（```` ``` ````）だけは
 * この対象になっておらず、フォーカスの有無にかかわらず言語名やフェンス行が一切
 * 見えない。Obsidian 同様、コードブロックにフォーカスがある間は開始行（```` ```js ````
 * 等）と終了行（```` ``` ````）を表示し、フォーカスが外れると隠れるようにする。
 *
 * 実行: `npm run test:browser`。ブラウザが無い環境では skip。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openPreview, type PreviewHandle } from '../previewBrowserHarness';

describe('実ブラウザ: コードフェンスの focus-expand（```lang` / ```` ``` ````表示）', function () {
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

    async function markerTexts(handle: PreviewHandle): Promise<string[]> {
        return handle.page.evaluate(() => {
            const pre = document.querySelector('.milkdown pre');
            if (!pre) return [];
            return Array.from(pre.querySelectorAll('.md-syntax-marker')).map(el => el.textContent || '');
        });
    }

    it('コードブロックにフォーカスがあるあいだ、開始行（```js` を含む）と終了行（```` ``` ````）が表示される', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '```js\nconst x = 1;\n```\n\n段落テキスト\n', '段落テキスト');

        await h.placeCursorAfterText('const x = 1;');
        await h.page.waitForTimeout(200);

        const markers = await markerTexts(h);
        assert.ok(
            markers.some(t => t.includes('```js')),
            `開始フェンス（\`\`\`js を含むマーカー）が見つからない: ${JSON.stringify(markers)}`
        );
        assert.ok(
            markers.some(t => t.trim() === '```'),
            `終了フェンス（\`\`\`）が見つからない: ${JSON.stringify(markers)}`
        );
        assert.deepStrictEqual(h.errors, []);
    });

    it('フォーカスがコードブロックから外れると、フェンスマーカーは隠れる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '```js\nconst x = 1;\n```\n\n段落テキスト\n', '段落テキスト');

        await h.placeCursorAfterText('const x = 1;');
        await h.page.waitForTimeout(200);
        assert.ok((await markerTexts(h)).length > 0, '前提: フォーカス中はマーカーが出ているはず');

        await h.placeCursorAfterText('段落テキスト');
        await h.page.waitForTimeout(200);

        assert.deepStrictEqual(await markerTexts(h), [], 'フォーカスが外れてもマーカーが残っている');
        assert.deepStrictEqual(h.errors, []);
    });

    it('フェンスマーカーは装飾のみで、実文書やホストへ送る Markdown には混入しない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '```js\nconst x = 1;\n```\n\n段落テキスト\n', '段落テキスト');

        await h.placeCursorAfterText('const x = 1;');
        await h.page.waitForTimeout(200);
        await h.type('!');

        const model = await h.model();
        assert.strictEqual(model.topTypes[0], 'code_block');
        assert.ok(!model.text.includes('```'), `実文書のテキストに \`\`\` が混入している: ${JSON.stringify(model.text)}`);

        const md = await h.lastChangeMarkdown();
        assert.ok(md, 'ホストへ change が送られていない');
        assert.strictEqual(md, '```js\nconst x = 1;!\n```\n\n段落テキスト\n');
        assert.deepStrictEqual(h.errors, []);
    });
});
