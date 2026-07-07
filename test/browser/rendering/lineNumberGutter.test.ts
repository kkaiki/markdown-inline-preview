/**
 * 実ブラウザ回帰テスト: 行番号ガター（lineNumberGutterPlugin）。
 *
 * 各トップレベルブロックの左に「ソース Markdown の開始行番号」を出す機能。
 * - 設定 showLineNumbers が true のときだけ表示する。
 * - 行番号は保存ファイルと同じ整形（tight リスト等）を通して数えるため、実際のソース行と一致する。
 * - 既存の diff ガターと共存する（別レイヤ）。
 *
 * jsdom では座標・widget 描画・シリアライズ整形の組み合わせを検証できないため、ここが砦。
 * 実行: `npm run test:browser`。ブラウザが無い環境では skip。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openPreview, type PreviewHandle } from '../previewBrowserHarness';

describe('実ブラウザ: 行番号ガター', function () {
    this.timeout(120000);

    let browser: Browser | null = null;
    let h: PreviewHandle | undefined;

    before(async () => { browser = await launchBrowser(); });
    after(async function () { this.timeout(20000); await browser?.close(); });
    afterEach(async () => { if (h) { await h.close(); h = undefined; } });

    /** 表示中の行番号テキストを順に返す。 */
    async function gutterNumbers(handle: PreviewHandle): Promise<string[]> {
        return handle.page.evaluate(() =>
            Array.from(document.querySelectorAll('.line-number-gutter')).map((e) => e.textContent || '')
        );
    }

    it('showLineNumbers=false のときは行番号を表示しない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '# Title\n\nbody\n', 'body', { showLineNumbers: false });
        await h.page.waitForTimeout(200);
        const visible = await h.page.evaluate(() => {
            const el = document.querySelector('.line-number-gutter');
            return el ? getComputedStyle(el).display !== 'none' : false;
        });
        assert.strictEqual(visible, false, '非表示設定なのに行番号が見えている');
        assert.deepStrictEqual(h.errors, []);
    });

    it('showLineNumbers=true で各ブロックに行番号が出る', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '# Title\n\nbody paragraph\n', 'body paragraph', { showLineNumbers: true });
        await h.page.waitForTimeout(300);
        const nums = await gutterNumbers(h);
        assert.deepStrictEqual(nums, ['1', '3'], `行番号が想定外: ${JSON.stringify(nums)}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('行番号が実際のソース行と一致する（見出し/段落/リスト/コード/引用）', async function () {
        if (!browser) { this.skip(); return; }
        const md = '# 見出し\n\n本文の段落です。\n\n- リスト項目1\n- リスト項目2\n\n```js\nconst x = 1;\nconsole.log(x);\n```\n\n> 引用文\n\n最後の段落。\n';
        h = await openPreview(browser, md, '最後の段落', { showLineNumbers: true });
        // 初期キャッシュではなく確定状態を見るため doc を変更して再計算させる。
        await h.placeCursorAfterText('最後の段落');
        await h.type('!');
        await h.page.waitForTimeout(300);
        const nums = await gutterNumbers(h);
        // 1:見出し 3:本文 5:リスト項目1 6:リスト項目2 8:コード 13:引用 15:最後
        // （リストは各項目に番号が出る）
        assert.deepStrictEqual(nums, ['1', '3', '5', '6', '8', '13', '15'], `行番号がソースと不一致: ${JSON.stringify(nums)}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('リストは各項目に行番号が出る（先頭だけでない）', async function () {
        if (!browser) { this.skip(); return; }
        const md = '# タイトル\n\n- [ ] 項目1\n- [ ] 項目2\n- [ ] 項目3\n\n本文\n';
        h = await openPreview(browser, md, '本文', { showLineNumbers: true });
        await h.placeCursorAfterText('本文');
        await h.type('!');
        await h.page.waitForTimeout(300);
        const nums = await gutterNumbers(h);
        // 見出し=1, 各項目=3,4,5, 本文=7
        assert.deepStrictEqual(nums, ['1', '3', '4', '5', '7'], `各項目に行番号が出ていない: ${JSON.stringify(nums)}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('番号付きリストも各項目に行番号が出る', async function () {
        if (!browser) { this.skip(); return; }
        const md = 'intro\n\n1. one\n2. two\n3. three\n\ntail\n';
        h = await openPreview(browser, md, 'tail', { showLineNumbers: true });
        await h.placeCursorAfterText('tail');
        await h.type('!');
        await h.page.waitForTimeout(300);
        const nums = await gutterNumbers(h);
        assert.deepStrictEqual(nums, ['1', '3', '4', '5', '7'], `番号付きリスト各項目に行番号が出ていない: ${JSON.stringify(nums)}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('コードブロックの行番号も（pre の overflow に）クリップされず表示される', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '# H\n\n```js\nconst x = 1;\n```\n', 'const x', { showLineNumbers: true });
        await h.page.waitForTimeout(300);
        const codeNumVisible = await h.page.evaluate(() => {
            const els = Array.from(document.querySelectorAll('.line-number-gutter'));
            // 2 つ目（コードブロック）の行番号が画面内に見えているか
            const code = els[1];
            if (!code) return false;
            const r = code.getBoundingClientRect();
            return r.left >= 0 && r.width > 0;
        });
        assert.strictEqual(codeNumVisible, true, 'コードブロックの行番号が表示されていない（クリップ）');
        assert.deepStrictEqual(h.errors, []);
    });

    it('showToolbar: true のときも行番号が viewport 左端よりも右にある（クリップされない）', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(
            browser,
            '# 見出し\n\n段落1\n\n段落2\n',
            '段落2',
            { showLineNumbers: true, showToolbar: true }
        );
        await h.page.waitForTimeout(400);
        const result = await h.page.evaluate(() => {
            const gutters = Array.from(document.querySelectorAll('.line-number-gutter'));
            if (gutters.length === 0) return { ok: false, reason: 'no .line-number-gutter elements' };
            for (const el of gutters) {
                const r = el.getBoundingClientRect();
                if (r.left < 0) {
                    return { ok: false, reason: `gutter left=${r.left} < 0 (off-screen left)` };
                }
                if (r.width <= 0) {
                    return { ok: false, reason: `gutter width=${r.width} (invisible)` };
                }
            }
            return { ok: true, reason: `${gutters.length} gutters all left >= 0` };
        });
        assert.strictEqual(result.ok, true, result.reason);
        assert.deepStrictEqual(h.errors, []);
    });

    it('showLineNumbers: true のとき .milkdown に padding-left が付与されて行番号スペースが確保される', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '# Title\n\nbody\n', 'body', { showLineNumbers: true });
        await h.page.waitForTimeout(300);
        const result = await h.page.evaluate(() => {
            const milkdown = document.querySelector('.milkdown');
            if (!milkdown) return { ok: false, reason: 'no .milkdown element' };
            const pl = parseFloat(getComputedStyle(milkdown).paddingLeft);
            // padding-left: 3.8rem ≈ 60px 以上であること（行番号スペース）
            return { ok: pl >= 50, reason: `padding-left=${pl}px (expected >= 50px for line numbers)` };
        });
        assert.strictEqual(result.ok, true, result.reason);
        assert.deepStrictEqual(h.errors, []);
    });
});
