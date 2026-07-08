/**
 * 実ブラウザ回帰テスト: 行番号ガター（lineNumberGutterPlugin）。
 *
 * 各トップレベルブロック（＋リスト項目）の左に「表示要素の連番」を出す機能。
 * - 設定 showLineNumbers が true のときだけ表示する。
 * - 番号はソース Markdown の行番号とは対応しない。1, 2, 3, ... と隙間なく振られる
 *   （以前は「ソース行番号の近似値」だったため空行や複数行ブロックで番号が飛んでいたが、
 *   連番方式に変更した。ソースの空行自体は別途、実体のある空 paragraph として復元表示
 *   されるようになったため、連番はそれも1要素として数える）。
 * - 既存の diff ガターと共存する（別レイヤ）。
 *
 * jsdom では座標・widget 描画の組み合わせを検証できないため、ここが砦。
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
        assert.deepStrictEqual(nums, ['1', '2'], `行番号が想定外: ${JSON.stringify(nums)}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('連番が要素の並び順どおりに振られる（見出し/段落/リスト/コード/引用）', async function () {
        if (!browser) { this.skip(); return; }
        const md = '# 見出し\n\n本文の段落です。\n\n- リスト項目1\n- リスト項目2\n\n```js\nconst x = 1;\nconsole.log(x);\n```\n\n> 引用文\n\n最後の段落。\n';
        h = await openPreview(browser, md, '最後の段落', { showLineNumbers: true });
        // 初期キャッシュではなく確定状態を見るため doc を変更して再計算させる。
        await h.placeCursorAfterText('最後の段落');
        await h.type('!');
        await h.page.waitForTimeout(300);
        const nums = await gutterNumbers(h);
        // 1:見出し 2:本文 3:リスト項目1 4:リスト項目2 5:コード 6:引用 7:最後（連番、隙間なし）
        assert.deepStrictEqual(nums, ['1', '2', '3', '4', '5', '6', '7'], `連番になっていない: ${JSON.stringify(nums)}`);
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
        // 見出し=1, 各項目=2,3,4, 本文=5（連番、隙間なし）
        assert.deepStrictEqual(nums, ['1', '2', '3', '4', '5'], `各項目に行番号が出ていない: ${JSON.stringify(nums)}`);
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
        assert.deepStrictEqual(nums, ['1', '2', '3', '4', '5'], `番号付きリスト各項目に行番号が出ていない: ${JSON.stringify(nums)}`);
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

    it('空行スペーサーはガター連番に含まれ、カーソルを置いて入力・Backspaceで削除できる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, 'para A\n\n\npara B\n', 'para A', { showLineNumbers: true });
        await h.page.waitForTimeout(300);

        let nums = await gutterNumbers(h);
        assert.deepStrictEqual(nums, ['1', '2', '3'], `空行スペーサーがガター連番に含まれていない: ${JSON.stringify(nums)}`);

        let m = await h.model();
        assert.deepStrictEqual(m.topTypes, ['paragraph', 'paragraph', 'paragraph'], '空行スペーサーが空 paragraph として復元されていない');

        // 空行スペーサー（para A の次のブロック）へカーソルを移動して入力する。
        await h.placeCursorAfterText('para A');
        await h.press('ArrowDown');
        await h.type('inserted');
        m = await h.model();
        assert.ok(m.outline.includes('"inserted"'), `空行スペーサーへの入力が反映されていない: ${m.outline}`);

        // 入力を取り消したうえで、空行スペーサーを Backspace で削除する（前のブロックと結合）。
        for (let i = 0; i < 'inserted'.length; i++) await h.press('Backspace');
        await h.press('Backspace');
        m = await h.model();
        assert.deepStrictEqual(m.topTypes, ['paragraph', 'paragraph'], `Backspace で空行スペーサーを削除できない: ${JSON.stringify(m.topTypes)}`);
        assert.deepStrictEqual(h.errors, []);
    });
});
