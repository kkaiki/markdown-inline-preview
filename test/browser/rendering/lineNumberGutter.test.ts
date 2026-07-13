/**
 * 実ブラウザ回帰テスト: 行番号ガター（lineNumberGutterPlugin）。
 *
 * 各トップレベルブロック（＋リスト項目）の左に「ソース Markdown 上の実際の行番号」を出す機能。
 * - 設定 showLineNumbers が true のときだけ表示する。
 * - 番号は Raw モード（CodeMirror）が表示する行番号と一致する（blank-line-preservation.md 3節）。
 *   1, 2, 3, ... の連番ではなく、実ソースの何行目かを示す。
 * - 表（table）・コードブロック（code_block）のように複数の物理行にまたがるブロックは、
 *   1ブロックにつき1番号ではなく、実際に表示される行ごとに1番号を出す（同 4節）。
 *   表のアラインメント区切り行（`:---|:---`）は対応する行が描画されないため番号も出ない。
 * - ソースの空行は blankLineRemarkPlugin により実体のある空 paragraph としてトップレベルに
 *   復元表示され、そこにも自分自身の実際の空行の行番号が出る。
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
    after(async function () { this.timeout(60000); await browser?.close(); });
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

    it('showLineNumbers=true で各ブロックに実ソース行番号が出る', async function () {
        if (!browser) { this.skip(); return; }
        // 1:# Title / 2:(空行) / 3:body paragraph
        h = await openPreview(browser, '# Title\n\nbody paragraph\n', 'body paragraph', { showLineNumbers: true });
        await h.page.waitForTimeout(300);
        const nums = await gutterNumbers(h);
        assert.deepStrictEqual(nums, ['1', '2', '3'], `行番号が想定外: ${JSON.stringify(nums)}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('新規空ページの編集用プレースホルダーには行番号を出さない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '', undefined, { showLineNumbers: true });
        await h.page.waitForTimeout(300);
        const nums = await gutterNumbers(h);
        assert.deepStrictEqual(nums, [], `空ページに不要な行番号が出ている: ${JSON.stringify(nums)}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('Rawの単一改行をPreviewでも改行表示し、改行後の行番号も出す', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, 'first line\nsecond line\n', 'first line', { showLineNumbers: true });
        await h.page.waitForTimeout(300);

        const result = await h.page.evaluate(() => {
            const first = Array.from(document.querySelectorAll('.ProseMirror p')).find((p) =>
                p.textContent?.includes('first line')
            );
            const hardbreak = first?.querySelector<HTMLElement>('span[data-type="hardbreak"]');
            return {
                numbers: Array.from(document.querySelectorAll('.line-number-gutter')).map((e) => e.textContent),
                hasHardbreak: !!hardbreak,
                hardbreakHeight: hardbreak?.getBoundingClientRect().height ?? 0
            };
        });
        assert.deepStrictEqual(result.numbers, ['1', '2']);
        assert.strictEqual(result.hasHardbreak, true, '単一改行がPreviewのhardbreakになっていない');
        assert.ok(result.hardbreakHeight > 0, '単一改行が見た目上の改行として表示されていない');
        assert.deepStrictEqual(h.errors, []);
    });

    it('実ソース行番号が要素の並び順どおりに振られる（見出し/段落/リスト/コード/引用）', async function () {
        if (!browser) { this.skip(); return; }
        const md = '# 見出し\n\n本文の段落です。\n\n- リスト項目1\n- リスト項目2\n\n```js\nconst x = 1;\nconsole.log(x);\n```\n\n> 引用文\n\n最後の段落。\n';
        // 空行も実ブロックとして表示するため 2/4/7/12/14 も含む。
        h = await openPreview(browser, md, '最後の段落', { showLineNumbers: true });
        // 初期キャッシュではなく確定状態を見るため doc を変更して再計算させる。
        await h.placeCursorAfterText('最後の段落');
        await h.type('!');
        await h.page.waitForTimeout(300);
        const nums = await gutterNumbers(h);
        // コードは開閉 ``` 自体も表示行なので 8〜11 をすべて含む。
        assert.deepStrictEqual(
            nums,
            ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15'],
            `実ソース行番号になっていない: ${JSON.stringify(nums)}`
        );
        assert.deepStrictEqual(h.errors, []);
    });

    it('コードブロックの非フォーカス時も開閉フェンスとその行番号を表示する', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '```js\nconst x = 1;\n```\n\noutside\n', 'outside', { showLineNumbers: true });
        await h.page.waitForTimeout(300);

        const fences = await h.page.locator('.code-fence-display').allTextContents();
        assert.deepStrictEqual(fences.map((s) => s.trim()), ['1```js', '3```']);
        assert.deepStrictEqual(await gutterNumbers(h), ['1', '2', '3', '4', '5']);
        assert.deepStrictEqual(h.errors, []);
    });

    it('コードブロックにフォーカスして実テキスト展開中は、フェンス widget が消えて ``` は1組だけ表示される（二重表示しない）', async function () {
        if (!browser) { this.skip(); return; }
        // 2026-07-13 ユーザー報告: フォーカスすると開きフェンス行（```tsx）が2行並ぶ。
        // 原因は widget の key 衝突（preview 時のフェンス widget と展開時の行番号 widget が
        // 同一 key になり、ProseMirror が古いフェンス DOM を使い回す）。
        h = await openPreview(browser, '```tsx\nuseMouseEvents\nshowPageCorners\n```\n\n段落テキスト\n', '段落テキスト', { showLineNumbers: true });

        await h.placeCursorAfterText('useMouseEvents');
        await h.page.waitForTimeout(300);

        const fenceWidgets = await h.page.locator('.code-fence-display').count();
        assert.strictEqual(fenceWidgets, 0, '展開中はフェンス widget を重ねてはいけない');

        const preText = await h.page.locator('.milkdown pre').first().innerText();
        const openCount = (preText.match(/```tsx/g) ?? []).length;
        assert.strictEqual(openCount, 1, `開きフェンスは1行だけ見えるはず: ${JSON.stringify(preText)}`);

        // 展開中の実テキストのフェンス行はコード構文としてハイライトしない
        // （expanded の設定が dispatch 後だったため hljs がマーカーを不正な構文として
        // 着色していた回帰の防止）。
        const highlightedFence = await h.page.evaluate(() => {
            const spans = Array.from(document.querySelectorAll('.milkdown pre [class*="hljs-"]'));
            return spans.some((s) => (s.textContent ?? '').includes('`'));
        });
        assert.strictEqual(highlightedFence, false, 'フェンスのバッククォートがハイライトされている');
        assert.deepStrictEqual(h.errors, []);
    });

    it('内容自体が完全なフェンス形（```〜```）のコードブロックでも、非フォーカス時は外側フェンス widget が表示される（誤って消えない）', async function () {
        if (!browser) { this.skip(); return; }
        // 展開検出が「内容の文字列がフェンス形かどうか」の判定だったため、内容自体が
        // ネストフェンスの完全形を持つブロックで誤発動し、外側フェンスが消えていた。
        h = await openPreview(browser, '````tsx\n```tsx\nuseMouseEvents\n```\n````\n\n段落テキスト\n', '段落テキスト', { showLineNumbers: true });
        await h.page.waitForTimeout(300);

        const fences = await h.page.locator('.code-fence-display').allTextContents();
        assert.strictEqual(fences.length, 2, `外側フェンス widget が2つ表示されるはず: ${JSON.stringify(fences)}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('水平線にも実ソース行番号が出る', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, 'above\n\n---\n\nbelow\n', 'below', { showLineNumbers: true });
        await h.page.waitForTimeout(300);

        const result = await h.page.evaluate(() => {
            const hr = document.querySelector('hr');
            const gutters = Array.from(document.querySelectorAll('.line-number-gutter')).map((e) => e.textContent);
            if (!hr) return { gutters, hasHrGutter: false };
            const prev = hr.previousElementSibling;
            return {
                gutters,
                hasHrGutter: prev?.classList.contains('line-number-gutter') && prev.textContent === '3'
            };
        });
        assert.deepStrictEqual(result.gutters, ['1', '2', '3', '4', '5']);
        assert.strictEqual(result.hasHrGutter, true, '水平線の直前に行番号 widget が出ていない');
        assert.deepStrictEqual(h.errors, []);
    });

    it('リストは各項目に実ソース行番号が出る（先頭だけでない）', async function () {
        if (!browser) { this.skip(); return; }
        const md = '# タイトル\n\n- [ ] 項目1\n- [ ] 項目2\n- [ ] 項目3\n\n本文\n';
        // 1:タイトル 2:(空行) 3:項目1 4:項目2 5:項目3 6:(空行) 7:本文
        h = await openPreview(browser, md, '本文', { showLineNumbers: true });
        await h.placeCursorAfterText('本文');
        await h.type('!');
        await h.page.waitForTimeout(300);
        const nums = await gutterNumbers(h);
        assert.deepStrictEqual(nums, ['1', '2', '3', '4', '5', '6', '7'], `各項目に実ソース行番号が出ていない: ${JSON.stringify(nums)}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('番号付きリストも各項目に実ソース行番号が出る', async function () {
        if (!browser) { this.skip(); return; }
        const md = 'intro\n\n1. one\n2. two\n3. three\n\ntail\n';
        // 1:intro 2:(空行) 3:one 4:two 5:three 6:(空行) 7:tail
        h = await openPreview(browser, md, 'tail', { showLineNumbers: true });
        await h.placeCursorAfterText('tail');
        await h.type('!');
        await h.page.waitForTimeout(300);
        const nums = await gutterNumbers(h);
        assert.deepStrictEqual(nums, ['1', '2', '3', '4', '5', '6', '7'], `番号付きリスト各項目に実ソース行番号が出ていない: ${JSON.stringify(nums)}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('表は行（ヘッダ行＋各データ行）ごとに実ソース行番号が出る（区切り行は対象外）', async function () {
        if (!browser) { this.skip(); return; }
        const md = '# T\n\n| a | b |\n| - | - |\n| 1 | 2 |\n| 3 | 4 |\n\nend\n';
        // 1:# T 2:(空行) 3:ヘッダ行 4:区切り行(番号無し) 5:データ行1 6:データ行2 7:(空行) 8:end
        h = await openPreview(browser, md, 'end', { showLineNumbers: true });
        await h.placeCursorAfterText('end');
        await h.type('!');
        await h.page.waitForTimeout(300);
        const nums = await gutterNumbers(h);
        assert.deepStrictEqual(nums, ['1', '2', '3', '5', '6', '7', '8'], `表の行ごとの実ソース行番号になっていない: ${JSON.stringify(nums)}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('コードブロックは物理行ごとに実ソース行番号が出る（空行を含む）', async function () {
        if (!browser) { this.skip(); return; }
        const md = '# H\n\n```\nline1\n\nline3\n```\n\nend\n';
        // 1:# H 2:(空行) 3:``` 4:line1 5:(コード内空行) 6:line3 7:``` 8:(空行) 9:end
        h = await openPreview(browser, md, 'end', { showLineNumbers: true });
        await h.placeCursorAfterText('end');
        await h.type('!');
        await h.page.waitForTimeout(300);
        const nums = await gutterNumbers(h);
        assert.deepStrictEqual(nums, ['1', '2', '3', '4', '5', '6', '7', '8', '9'], `コードブロックの物理行ごとの実ソース行番号になっていない: ${JSON.stringify(nums)}`);
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
            // padding-left: 4.4rem ≈ 70px 以上であること（行番号スペース）
            return { ok: pl >= 50, reason: `padding-left=${pl}px (expected >= 50px for line numbers)` };
        });
        assert.strictEqual(result.ok, true, result.reason);
        assert.deepStrictEqual(h.errors, []);
    });

    it('行番号は差分色バーより左に離れて表示される', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, 'changed\n', 'changed', { showLineNumbers: true });
        await h.page.waitForTimeout(300);
        const result = await h.page.evaluate(() => {
            const block = document.querySelector<HTMLElement>('.milkdown .editor > *');
            const gutter = block?.querySelector<HTMLElement>('.line-number-gutter');
            if (!block || !gutter) return { ok: false, reason: 'block or gutter not found' };

            block.classList.add('diff-added');
            const blockRect = block.getBoundingClientRect();
            const gutterRect = gutter.getBoundingClientRect();
            const diffBarLeft = blockRect.left - 14;
            return {
                ok: gutterRect.right <= diffBarLeft - 4,
                reason: `gutterRight=${gutterRect.right}px diffBarLeft=${diffBarLeft}px`
            };
        });
        assert.strictEqual(result.ok, true, result.reason);
        assert.deepStrictEqual(h.errors, []);
    });

    it('空行スペーサーは自分自身の実ソース行番号を表示し、カーソルを置いて入力・Backspaceで削除できる', async function () {
        if (!browser) { this.skip(); return; }
        // 1:para A 2:(空行) 3:(空行) 4:para B
        h = await openPreview(browser, 'para A\n\n\npara B\n', 'para A', { showLineNumbers: true });
        await h.page.waitForTimeout(300);

        let nums = await gutterNumbers(h);
        assert.deepStrictEqual(nums, ['1', '2', '3', '4'], `空行スペーサーの実ソース行番号が出ていない: ${JSON.stringify(nums)}`);

        let m = await h.model();
        assert.deepStrictEqual(m.topTypes, ['paragraph', 'paragraph', 'paragraph', 'paragraph'], '空行スペーサーが空 paragraph として復元されていない');

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
        assert.deepStrictEqual(m.topTypes, ['paragraph', 'paragraph', 'paragraph'], `Backspace で空行スペーサーを1つ削除できない: ${JSON.stringify(m.topTypes)}`);
        assert.deepStrictEqual(h.errors, []);
    });
});
