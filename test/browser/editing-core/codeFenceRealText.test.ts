/**
 * 実ブラウザテスト: コードフェンス（```）を常に実テキストとして文書に持つ
 * （`code-fence-always-real-text.md` 段階1・2・3）。
 *
 * これまでフェンスは表示専用の widget だったため、フェンス行にカーソルを置けず、
 * 「``` を1文字消したらリアルタイムでコード表示を解除する」ができなかった
 * （2026-07-27 ユーザー要望）。フェンスを code_block の内容の先頭行・最終行として
 * 常に持たせ、直列化の各経路（保存・コピー・行番号・差分）で剥がすことで、
 * 「見えているものが文書そのもの」にする。
 *
 * **状態: 未実装（pending）**。仕様は `docs/specifications/code-fence-always-real-text.md`。
 * ここに書かれているのは「これから実装する動作」であり、現状はすべて失敗する。
 * 実装（段階1〜4を同時に入れる必要がある。途中まででは画面上フェンスが二重に見える）が
 * 入った時点で `describe.skip` を `describe` に戻す。
 *
 * 実行: `npm run test:browser`。ブラウザが無い環境では skip。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openPreview, type PreviewHandle } from '../previewBrowserHarness';

const SRC = '前の段落\n\n```js\nconst a = 1;\n```\n\n後の段落\n';

describe.skip('実ブラウザ: コードフェンスを常に実テキストとして持つ（未実装: code-fence-always-real-text.md）', function () {
    this.timeout(120000);

    let browser: Browser | null = null;
    let h: PreviewHandle | undefined;

    before(async () => { browser = await launchBrowser(); });
    after(async () => { await browser?.close(); });
    afterEach(async () => { if (h) { await h.close(); h = undefined; } });

    it('コードブロックを開くと、フェンス行が文書の実テキストとして入っている', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, SRC, '後の段落');
        const m = await h.model();
        assert.ok(
            m.outline.includes('code_block["```js\\nconst a = 1;\\n```"]'),
            `フェンスが実テキストになっていない: ${m.outline}`
        );
        assert.deepStrictEqual(h.errors, []);
    });

    it('フェンス行にカーソルを置ける', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, SRC, '後の段落');
        await h.placeCursorAfterText('```js');
        await h.page.waitForTimeout(150);

        const line = await h.currentLineText();
        assert.strictEqual(line, '```js', `フェンス行にカーソルが乗っていない: ${JSON.stringify(line)}`);
        const caretTop = await h.caretTop();
        assert.ok(caretTop !== null, 'キャレットの位置が取得できない（フェンスが編集不可のまま）');
        assert.deepStrictEqual(h.errors, []);
    });

    it('フェンスが実テキストでも、保存 Markdown は二重フェンスにならない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, SRC, '後の段落');
        await h.placeCursorAfterText('後の段落');
        await h.type('X');
        await h.waitForMarkdown('前の段落\n\n```js\nconst a = 1;\n```\n\n後の段落X\n');
        assert.deepStrictEqual(h.errors, []);
    });

    it('開きフェンスのバッククォートを1つ消すと、その場でコード表示が解除される', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, SRC, '後の段落');
        await h.placeCursorAfterText('```js');
        await h.press('ArrowLeft');
        await h.press('ArrowLeft'); // "js" の手前（``` の直後）へ
        await h.press('Backspace');
        await h.page.waitForTimeout(250);

        const m = await h.model();
        assert.ok(
            !m.topTypes.includes('code_block'),
            `フェンスを壊してもコードブロックのまま: ${m.outline}`
        );
        assert.ok(m.text.includes('const a = 1;'), `コード本文が失われた: ${m.outline}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('壊したフェンスを打ち直して揃えると、その場でコード表示へ戻る', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, SRC, '後の段落');
        await h.placeCursorAfterText('```js');
        await h.press('ArrowLeft');
        await h.press('ArrowLeft');
        await h.press('Backspace');
        await h.page.waitForTimeout(250);
        assert.ok(!(await h.model()).topTypes.includes('code_block'), '前提: 解除されていない');

        await h.type('`');
        await h.page.waitForTimeout(250);

        const m = await h.model();
        assert.ok(
            m.topTypes.includes('code_block'),
            `フェンスを揃え直してもコードブロックに戻らない: ${m.outline}`
        );
        assert.deepStrictEqual(h.errors, []);
    });
});
