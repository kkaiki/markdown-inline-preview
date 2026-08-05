/**
 * Live モード Phase 0 の受け入れテスト（実 Chromium）。
 *
 * requirements.md R1.1 / R1.2 の「ドキュメントは生 Markdown そのもの」「カーソルオフセットは
 * 常にソースと 1:1」を、実ブラウザ上の本物の CodeMirror 6 で固定する。既存 Preview
 * （Milkdown/ProseMirror）が往復変換で空行や記法を失ってきた問題を、Live モードでは
 * 構造的に起こさないための最初の防壁。
 *
 * 受け入れ基準: requirements.md §6 の必須回帰テスト #1（バイト不変）。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openLive, type LiveHandle } from '../../liveBrowserHarness';

describe('Live モード: ドキュメント忠実性（実ブラウザ）', function () {
    this.timeout(120000);

    let browser: Browser | null = null;
    let h: LiveHandle | undefined;

    before(async () => {
        browser = await launchBrowser();
    });
    after(async function () {
        this.timeout(20000);
        await browser?.close();
    });
    afterEach(async () => {
        if (h) {
            await h.close();
            h = undefined;
        }
    });

    const SAMPLE = [
        '# 見出し1',
        '',
        '',
        '本文の **太字** と `コード` と [リンク](https://example.com)。',
        '',
        '- 箇条書き1',
        '  - ネスト',
        '- [ ] タスク',
        '',
        '> 引用',
        '',
        '```js',
        'const a = 1;',
        '```',
        '',
        '| A | B |',
        '| --- | --- |',
        '| 1 | 2 |',
        ''
    ].join('\n');

    it('開いただけではドキュメントが1文字も変わらない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, SAMPLE);
        assert.strictEqual(await h.doc(), SAMPLE);
        assert.deepStrictEqual(h.errors, []);
    });

    it('連続する空行が失われない（往復変換をしていないことの証明）', async function () {
        if (!browser) { this.skip(); return; }
        const src = 'あ\n\n\n\n\nい\n';
        h = await openLive(browser, src);
        assert.strictEqual(await h.doc(), src);
    });

    it('末尾の改行の有無がそのまま保たれる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '改行なしで終わる');
        assert.strictEqual(await h.doc(), '改行なしで終わる');
    });

    it('カーソルを置いても（記法が展開されても）ドキュメントは変わらない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, SAMPLE);
        for (const off of [0, 3, 20, 40, 60]) {
            await h.setCursor(off);
        }
        assert.strictEqual(await h.doc(), SAMPLE);
        assert.deepStrictEqual(h.errors, []);
    });

    it('記法の展開/収縮では host へ編集メッセージを送らない（Git 差分を汚さない）', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, SAMPLE);
        await h.setCursor(2);
        await h.setCursor(30);
        await h.blur();
        await h.focus();
        const edits = (await h.sent()).filter((m) => m.type === 'edit');
        assert.deepStrictEqual(edits, [], `展開/収縮だけで edit が送られた: ${JSON.stringify(edits)}`);
    });

    it('行末の End はソースの実長へ行く（隠れた記法ぶんズレない）', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '- 項目1\n');
        await h.setCursor(0);
        await h.press('End');
        assert.strictEqual(await h.cursor(), 5, '"- 項目1" の実長は5');
    });

    it('隠れた記法の上を右矢印で1文字ずつ通過できる（まとめてスキップしない）', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, 'ab **cd** ef\n');
        await h.setCursor(2);
        const seen: number[] = [];
        for (let i = 0; i < 3; i++) {
            await h.press('ArrowRight');
            seen.push(await h.cursor());
        }
        assert.deepStrictEqual(seen, [3, 4, 5]);
    });

    it('文字を入力すると host へ差分（全体置換ではない）が送られる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, 'abc\n');
        await h.setCursor(3);
        await h.type('d');
        const edits = (await h.sent()).filter((m) => m.type === 'edit');
        assert.strictEqual(edits.length, 1, `edit が1件でない: ${JSON.stringify(edits)}`);
        assert.deepStrictEqual(edits[0].changes, [{ from: 3, to: 3, insert: 'd' }]);
        assert.strictEqual(await h.doc(), 'abcd\n');
    });
});
