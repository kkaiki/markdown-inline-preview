/**
 * 実ブラウザ回帰テスト（本番バンドル）: フォーカス中のコードブロックで Cmd/Ctrl+A したとき、
 * `codeFenceEditPlugin` が実テキストとして挿入した開き/閉じフェンス（```lang` / ```）を
 * 選択範囲に含めない。
 *
 * ## 背景
 *
 * `codeFenceEditPlugin.ts` はフォーカス中のコードブロックの開き・閉じフェンスを実テキスト
 * として挿入する（`code-fence-real-text-edit-fix.md`）。`previewKeymapPlugin.ts` の
 * `handleSelectAll` は `code_block` 内では `$from.start(depth)`〜`$from.end(depth)`
 * （ノードの中身全体）を選択していたため、フォーカス中はこの実テキスト化されたフェンスも
 * 選択に含まれてしまい、ユーザーが Cmd+A → コピー したときにコード本文だけでなく
 * ```` ```lang ```` 〜 ```` ``` ```` まで含まれてしまっていた（ユーザー報告）。
 *
 * 実行: `npm run test:browser`。ブラウザが無い環境では skip。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openPreview, type PreviewHandle } from '../previewBrowserHarness';

describe('実ブラウザ: コードブロックの Cmd+A がフェンス自体を選択に含まない', function () {
    this.timeout(120000);

    let browser: Browser | null = null;
    let h: PreviewHandle | undefined;

    before(async () => { browser = await launchBrowser(); });
    after(async function () { this.timeout(20000); await browser?.close(); });
    afterEach(async () => { if (h) { await h.close(); h = undefined; } });

    async function selectedText(handle: PreviewHandle): Promise<string> {
        return handle.page.evaluate(() => {
            /* eslint-disable @typescript-eslint/no-explicit-any */
            const view = (window as any).__view;
            const { from, to } = view.state.selection;
            return view.state.doc.textBetween(from, to, '\n', '\n');
            /* eslint-enable @typescript-eslint/no-explicit-any */
        });
    }

    it('コードブロック内の Cmd+A はコード本文だけを選択する（記法は本文に無い）', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '```python\nconst a = 1\nconst b = 2\n```\n\n段落\n', '段落');

        await h.placeCursorAfterText('const a = 1');
        await h.page.waitForTimeout(150);
        const model = await h.model();
        assert.strictEqual(model.text.includes('```'), false, `前提: 記法が本文に入っている: ${JSON.stringify(model.text)}`);

        await h.press('Meta+a');
        const selected = await selectedText(h);
        assert.strictEqual(selected, 'const a = 1\nconst b = 2', `フェンスまで選択に含まれている: ${JSON.stringify(selected)}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('コードブロック内の Cmd+A で、表示用フェンス行が選択のハイライトに入らない（開き・閉じとも）', async function () {
        if (!browser) { this.skip(); return; }
        // 表示用フェンス（`.code-fence-display` widget）は全て side: -1 で「位置の手前」に
        // 描画されていたため、閉じフェンスだけが DOM 上の選択範囲の内側に入り、開きは
        // 入らない、という非対称なハイライトになっていた（2026-07-27 ユーザー報告の
        // スクリーンショット: 上の ``` は白いのに下の ``` だけ青く塗られる）。
        h = await openPreview(browser, '```\ndocs/\n  testing/\n```\n\n段落\n', '段落', { showLineNumbers: true });

        await h.placeCursorAfterText('docs/');
        await h.page.waitForTimeout(150);
        await h.press('Meta+a');

        const contained = await h.page.evaluate(() => {
            const fences = Array.from(document.querySelectorAll('.milkdown .code-fence-display'));
            const sel = window.getSelection();
            if (!sel) return [];
            return fences.map((f) => sel.containsNode(f, true));
        });
        assert.strictEqual(contained.length, 2, `表示フェンスが2本無い: ${JSON.stringify(contained)}`);
        assert.deepStrictEqual(
            contained,
            [false, false],
            `フェンス行が選択ハイライトに含まれている（[開き, 閉じ]）: ${JSON.stringify(contained)}`
        );
        assert.deepStrictEqual(h.errors, []);
    });

    it('コードブロック内の Cmd+A → もう一度で文書全体になる（段階選択が壊れない）', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '```\nfoo\n```\n\n段落\n', '段落');

        await h.placeCursorAfterText('foo');
        await h.page.waitForTimeout(150);

        await h.press('Meta+a'); // 1回目: コード本文
        assert.strictEqual(await selectedText(h), 'foo');

        await h.press('Meta+a'); // 2回目: 文書全体
        const size = await h.page.evaluate(() => (window as unknown as { __view: { state: { doc: { content: { size: number } } } } }).__view.state.doc.content.size);
        const sel = await h.page.evaluate(() => {
            const view = (window as unknown as { __view: { state: { selection: { from: number; to: number } } } }).__view;
            return { from: view.state.selection.from, to: view.state.selection.to };
        });
        assert.strictEqual(sel.from, 0);
        assert.strictEqual(sel.to, size);
        assert.deepStrictEqual(h.errors, []);
    });
});
