/**
 * 実ブラウザ回帰テスト: blockPrefixEditPlugin の不具合回帰。
 *
 * ## テスト対象バグ
 *
 * 1. **チェックボックス変換時に checked=false が保持されない**
 *    ⌥⌘4 でリストアイテムをチェックボックスに変換すると、blockPrefixEditPlugin が
 *    collapse 処理で checked を null に戻してしまう。
 *
 * 2. **見出しからフォーカスを外すと ## プレフィックスが残る（見かけ上 #### 表示）**
 *    collapse 処理が stale な nodePos/contentStart を使うためプレフィックス削除に
 *    失敗し、focusSyntaxPlugin の CSS ::before 装飾と合わさって二重表示になる。
 *
 * 3. **⌥⌘5（箇条書きトグル）を複数回押すと "- " が累積する**
 *    liftListItem 後に nodePos が無効になり collapse が早期 return するため、
 *    "- " プレフィックスが段落テキストに残る。次回 wrap 時に再び "- " が挿入され
 *    "- - text" など累積していく。
 *
 * 4. **⌥⌘4 後のカーソル位置がリスト項目外に飛ぶ**
 *    expand/collapse サイクルが連鎖してカーソルが意図しない位置に移動する。
 *
 * 実行: `npm run test:browser`。ブラウザが無い環境では skip。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openPreview, type PreviewHandle } from '../previewBrowserHarness';

describe('実ブラウザ: blockPrefixEditPlugin バグ回帰', function () {
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

    // ─────────────────────────────────────────────────────────────────────────
    // Bug 1: ⌥⌘4 でチェックボックスに変換後、checked=false が保持される
    // ─────────────────────────────────────────────────────────────────────────
    it('Bug1: ⌥⌘4 で段落をチェックボックスに変換後、list_item(checked=false) になる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '変換対象\n\nTAIL\n', '変換対象');
        await h.placeCursorAfterText('変換対象');
        // ⌥⌘4 = Alt+Meta+4 = チェックボックスショートカット
        await h.press('Alt+Meta+4');
        await h.page.waitForTimeout(300);
        const m = await h.model();
        assert.ok(
            m.outline.includes('list_item(checked=false)'),
            `checked=false のリスト項目が無い: ${m.outline}`
        );
        assert.ok(
            !m.outline.includes('list_item(checked=null)'),
            `checked=null のリスト項目（通常箇条書き）が残っている: ${m.outline}`
        );
        assert.deepStrictEqual(h.errors, []);
    });

    it('Bug1: ⌥⌘4 変換後のテキスト内に "- " プレフィックスが残らない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '見積もり作成\n\nTAIL\n', '見積もり作成');
        await h.placeCursorAfterText('見積もり作成');
        await h.press('Alt+Meta+4');
        await h.page.waitForTimeout(300);
        const m = await h.model();
        // テキスト内に "- " が残っていないこと（checked=false であれば "見積もり作成" のみ）
        assert.ok(
            m.outline.includes('paragraph["見積もり作成"]'),
            `テキスト内に "- " が残っている、または期待外の内容: ${m.outline}`
        );
        assert.deepStrictEqual(h.errors, []);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Bug 2: H2 見出しをフォーカス→外してもプレフィックスが残らない
    // ─────────────────────────────────────────────────────────────────────────
    it('Bug2: H2 にカーソルを置いて別ブロックへ移動後、見出しレベルは 2 のまま', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '## 修正ループ\n\n段落テキスト\n', '段落テキスト');
        // H2 にフォーカス
        await h.placeCursorAfterText('修正ループ');
        await h.page.waitForTimeout(200);
        // 別のブロックへ移動 → collapse がトリガーされる
        await h.placeCursorAfterText('段落テキスト');
        await h.page.waitForTimeout(300);
        const m = await h.model();
        assert.ok(
            m.outline.includes('heading(2)["修正ループ"]'),
            `H2 レベルかテキストが変わってしまった: ${m.outline}`
        );
        assert.deepStrictEqual(h.errors, []);
    });

    it('Bug2: H2 フォーカス→外す を複数回繰り返してもプレフィックスが累積しない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '## 見出し\n\n段落\n', '段落');

        for (let i = 0; i < 3; i++) {
            await h.placeCursorAfterText('見出し');
            await h.page.waitForTimeout(200);
            await h.placeCursorAfterText('段落');
            await h.page.waitForTimeout(200);
        }

        const m = await h.model();
        // 見出しテキストが "見出し" のまま（"## 見出し" や "#### 見出し" でない）
        assert.ok(
            m.outline.includes('heading(2)["見出し"]'),
            `プレフィックス累積でテキストまたはレベルが変化: ${m.outline}`
        );
        assert.ok(
            !m.text.includes('## 見出し'),
            `"## " がテキストに残っている: ${m.text}`
        );
        assert.deepStrictEqual(h.errors, []);
    });

    it('Bug2: 見出し collapse 後にテキストに "## " が残らない（raw markdown を確認）', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '## ループ改善\n\n本文\n', '本文');
        await h.placeCursorAfterText('ループ改善');
        await h.page.waitForTimeout(200);
        // 別ブロックへ移動して collapse を発火させる
        await h.placeCursorAfterText('本文');
        await h.page.waitForTimeout(300);

        // ホストへ送られた markdown を確認（## が二重でないこと）
        const md = await h.lastChangeMarkdown();
        if (md !== null) {
            assert.ok(
                !md.includes('## ## '),
                `markdown に "## ## " が含まれている（プレフィックス累積）: ${md}`
            );
            assert.ok(
                md.includes('## ループ改善'),
                `H2 が失われている: ${md}`
            );
        }
        assert.deepStrictEqual(h.errors, []);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Bug 3: ⌥⌘5 を複数回押すと "- " が累積する
    // ─────────────────────────────────────────────────────────────────────────
    it('Bug3: ⌥⌘5 で箇条書きにして、もう一度 ⌥⌘5 で解除後、テキストに "- " が残らない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '元の文章\n\nTAIL\n', '元の文章');
        await h.placeCursorAfterText('元の文章');

        // 1 回目: 箇条書きに変換
        await h.press('Alt+Meta+5');
        await h.page.waitForTimeout(200);
        let m = await h.model();
        assert.ok(m.outline.includes('bullet_list'), `1 回目で箇条書きにならない: ${m.outline}`);

        // 2 回目: 箇条書きを解除
        await h.press('Alt+Meta+5');
        await h.page.waitForTimeout(300);
        m = await h.model();

        assert.ok(
            m.outline.includes('paragraph["元の文章"]'),
            `解除後にテキスト内に "- " が残っている: ${m.outline}`
        );
        assert.ok(
            !m.outline.includes('bullet_list'),
            `解除後も bullet_list が残っている: ${m.outline}`
        );
        assert.deepStrictEqual(h.errors, []);
    });

    it('Bug3: ⌥⌘5 を 6 回押した後、テキストに "- - -" が累積しない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '累積テスト\n\nTAIL\n', '累積テスト');
        await h.placeCursorAfterText('累積テスト');

        // 3 往復（ラップ→リフトを 3 回）
        for (let i = 0; i < 3; i++) {
            await h.press('Alt+Meta+5');
            await h.page.waitForTimeout(200);
            await h.press('Alt+Meta+5');
            await h.page.waitForTimeout(200);
        }

        const m = await h.model();
        // "- " が累積していれば "- - - 累積テスト" のようになる
        assert.ok(
            m.outline.includes('paragraph["累積テスト"]'),
            `"- " が累積してテキストが変化: ${m.outline}`
        );
        assert.ok(
            !m.text.includes('- '),
            `テキストに "- " が残っている: ${m.text}`
        );
        assert.deepStrictEqual(h.errors, []);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Bug 4: ⌥⌘4 後のカーソルがリスト項目テキスト内にある
    // ─────────────────────────────────────────────────────────────────────────
    it('Bug4: ⌥⌘4 後のカーソルがリスト項目の段落内にある', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '作業項目\n\nTAIL\n', '作業項目');
        await h.placeCursorAfterText('作業項目');
        await h.press('Alt+Meta+4');
        await h.page.waitForTimeout(300);
        const m = await h.model();
        // カーソルが list_item の段落内（"作業項目" テキストを含む段落）にある
        assert.ok(
            m.selParentText.includes('作業項目') || m.selParentText === '作業項目',
            `カーソルが list_item 外に飛んだ: selParentText="${m.selParentText}" outline="${m.outline}"`
        );
        assert.deepStrictEqual(h.errors, []);
    });

    it('Bug4: ⌥⌘4 後のカーソル位置が文書の先頭（pos=1）に飛ばない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '作業A\n\n作業B\n\nTAIL\n', '作業B');
        await h.placeCursorAfterText('作業B');
        const posBefore = (await h.model()).selFrom;
        await h.press('Alt+Meta+4');
        await h.page.waitForTimeout(300);
        const posAfter = (await h.model()).selFrom;
        // 変換前後でカーソルが大きく前方へ移動していない（先頭に飛んでいない）
        assert.ok(
            posAfter > 2,
            `カーソルが文書先頭（pos=${posAfter}）に飛んだ（変換前 pos=${posBefore}）`
        );
        assert.deepStrictEqual(h.errors, []);
    });
});
