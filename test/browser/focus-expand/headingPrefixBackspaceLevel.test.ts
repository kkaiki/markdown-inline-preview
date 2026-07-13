/**
 * 実ブラウザ回帰テスト: 見出しプレフィックス編集中に `#` を Backspace で削除したあと、
 * フォーカスを外して再度フォーカスすると見出しレベルが意図せず増える不具合。
 *
 * ## 調査結果
 *
 * ユーザー報告「# を1つ消して unfocus→focus を繰り返すと ### が増えていく」を
 * 実ブラウザで多数のパターン（1文字ずつの削除、実クリックでの操作、待機なしの
 * 高速操作、前方からの Delete 等）で再現を試みたところ、**「#」を1つだけ・または
 * 数個残して削除するケースは正しく動作する**（レベルは正しく増減し、再フォーカスでも
 * 表示される # の数は一致する）ことを確認した（下の「Backspace で1つ削除 → 正しく
 * H3 になる」テスト、および「複数回繰り返しても安定する」テストが green で固定）。
 *
 * 唯一再現できた実バグは、**「#」を全部（0個まで）削除しきった場合**:
 * `collapseHeading` の正規表現 `/^(#{1,6})\s/` は最低1個の `#` が無いとマッチせず、
 * マッチしないと「削除ゼロ・レベル変更なし」のまま何もせず collapse してしまう。
 * その結果、展開時に挿入した区切り文字（NBSP, U+00A0）が実テキストとして
 * **本文の中に残り続け**、見出しレベルも元のまま固着する。次に再フォーカスすると、
 * 元のレベル分の新しい "####" + NBSP がその残骸の**手前に**挿入されるため、
 * 見た目上は "####  見出し"（NBSP が2つ、余分な隙間）のように増殖して見える。
 * これを繰り返すたびに残骸の NBSP が積み重なっていく。
 *
 * `#` を全部消すというのは「もう見出しではない」という明確な意図なので、
 * 修正方針はレベルを弄るのではなく **ノードタイプを heading → paragraph へ変換する**
 * （`codeBlockBackspace.ts` がフェンス解除で code_block → paragraph に変換するのと
 * 同じ発想）。詳細仕様は `docs/specifications/heading-prefix-zero-hash-collapse-fix.md`。
 *
 * 実行: `npm run test:browser`。ブラウザが無い環境では skip。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openPreview, type PreviewHandle } from '../previewBrowserHarness';

describe('実ブラウザ: 見出しプレフィックスの Backspace 編集後、レベルが増殖しない', function () {
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

    /** 展開時の区切り文字は non-breaking space（` `）。 */
    const NBSP = ' ';

    /** 見出しテキスト中の `#` の連続数（プレフィックスの `#` 個数）を数える。 */
    function countLeadingHashes(text: string): number {
        const m = /^(#{1,10})/.exec(text);
        return m ? m[1].length : 0;
    }

    it('H4 の "####" から1文字 Backspace で H3 にした後、フォーカスを外して戻してもレベルは3のまま', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '#### 見出し\n\n本文\n', '見出し');

        // 1. 見出しにフォーカス → "####" + NBSP が実テキストとして展開される
        await h.placeCursorAfterText('見出し');
        await h.page.waitForTimeout(150);
        let model = await h.model();
        assert.strictEqual(countLeadingHashes(model.text), 4, `展開直後の # 個数が4でない: ${JSON.stringify(model.text)}`);
        assert.ok(model.text.includes(`####${NBSP}見出し`), `展開直後のテキストが期待形と違う: ${JSON.stringify(model.text)}`);

        // 2. "####" の直後（区切り空白の直前）で Backspace → "### " になるはず
        await h.placeCursorAfterText('####');
        await h.press('Backspace');
        model = await h.model();
        assert.strictEqual(countLeadingHashes(model.text), 3, `Backspace 直後の # 個数が3でない: ${JSON.stringify(model.text)}`);

        // 3. フォーカスを外す（collapse）→ レベルは3になっているはず
        await h.placeCursorAfterText('本文');
        await h.page.waitForTimeout(150);
        model = await h.model();
        assert.ok(model.outline.includes('heading(3)'), `collapse 後、見出しレベルが3になっていない: ${model.outline}`);
        assert.ok(!model.text.includes('#'), `collapse 後は # がドキュメント本文に残っていてはいけない: ${JSON.stringify(model.text)}`);

        // 4. 再度見出しへフォーカス（re-expand）→ 表示される # は3個のままのはず
        await h.placeCursorAfterText('見出し');
        await h.page.waitForTimeout(150);
        model = await h.model();
        assert.strictEqual(countLeadingHashes(model.text), 3, `再フォーカス後の # 個数が3でない（レベルが増殖した疑い）: ${JSON.stringify(model.text)}`);

        assert.deepStrictEqual(h.errors, []);
    });

    it('"#" を Backspace で削除した直後（フォーカスを外す前）に、見出しの実レベルがリアルタイムで更新される', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '### 見出し\n\n本文\n', '見出し');

        await h.placeCursorAfterText('見出し');
        await h.page.waitForTimeout(150);
        let model = await h.model();
        assert.ok(model.outline.includes('heading(3)'), `展開直後はまだ元のレベル(3)のはず: ${model.outline}`);

        // "###" の直後（区切り空白の直前）で Backspace → "## " になるが、まだフォーカスは
        // 外していない（本文へは移動していない）。
        await h.placeCursorAfterText('###');
        await h.press('Backspace');
        model = await h.model();
        assert.strictEqual(countLeadingHashes(model.text), 2, `Backspace 直後の # 個数が2でない: ${JSON.stringify(model.text)}`);
        assert.ok(model.outline.includes('heading(2)'), `フォーカスを外す前でも見出しレベルはリアルタイムで2になるはず: ${model.outline}`);

        assert.deepStrictEqual(h.errors, []);
    });

    it('さらにもう一度 unfocus→focus を繰り返してもレベルは3のまま安定する（累積しない）', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '#### 見出し\n\n本文\n', '見出し');

        await h.placeCursorAfterText('見出し');
        await h.page.waitForTimeout(150);
        await h.placeCursorAfterText('####');
        await h.press('Backspace');

        // unfocus → focus を3回繰り返す
        for (let i = 0; i < 3; i++) {
            await h.placeCursorAfterText('本文');
            await h.page.waitForTimeout(120);
            await h.placeCursorAfterText('見出し');
            await h.page.waitForTimeout(120);
        }

        const model = await h.model();
        assert.ok(model.outline.includes('heading(3)'), `繰り返し後もレベルは3のはず: ${model.outline}`);
        assert.strictEqual(countLeadingHashes(model.text), 3, `繰り返し後の # 個数が3でない: ${JSON.stringify(model.text)}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('# を全部（0個まで）削除すると、見出しではなく段落になる（残骸のNBSPも残らない）', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '#### 見出し\n\n本文\n', '見出し');

        await h.placeCursorAfterText('見出し');
        await h.page.waitForTimeout(150);
        await h.placeCursorAfterText('####');
        for (let i = 0; i < 4; i++) await h.press('Backspace');

        let model = await h.model();
        assert.strictEqual(countLeadingHashes(model.text), 0, `4回 Backspace 後は # が残っていないはず: ${JSON.stringify(model.text)}`);

        // フォーカスを外す（collapse）→ 見出しではなく段落になっているべき。
        // 区切り文字（NBSP）の残骸もテキストに残ってはいけない。
        await h.placeCursorAfterText('本文');
        await h.page.waitForTimeout(150);
        model = await h.model();
        assert.strictEqual(model.topTypes[0], 'paragraph', `# を全部消したら見出しは段落になるべき: ${model.outline}`);
        assert.ok(!/^\s/.test(model.text), `段落先頭に残骸の空白（NBSP等）が残っている: ${JSON.stringify(model.text)}`);
        assert.ok(model.text.startsWith('見出し'), `段落テキストが期待と違う: ${JSON.stringify(model.text)}`);

        // 段落になった後は heading 用の focus-expand 対象ではないので、
        // 再フォーカスしても # は一切現れないはず。
        await h.placeCursorAfterText('見出し');
        await h.page.waitForTimeout(150);
        model = await h.model();
        assert.strictEqual(countLeadingHashes(model.text), 0, `段落化後に再フォーカスしても # が出てはいけない: ${JSON.stringify(model.text)}`);

        assert.deepStrictEqual(h.errors, []);
    });
});
