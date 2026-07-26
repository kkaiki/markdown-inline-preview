/**
 * 実ブラウザ回帰テスト（本番バンドル）: ソース Markdown の空行と、Preview 上に見える
 * 空行ブロックの本数の対応を固定する。
 *
 * ## 仕様（2026-07-26 ユーザー指示で確定）
 *
 * **ソースの空行 N 行 → Preview 上でも見える空行 N 行**（1:1）。省略しない。
 *
 * Preview の段落は CSS で `margin: 0`（`media/milkdown-preview.css`）なので、空行を
 * 空 paragraph として実体化しない限り、その行は画面上のどこにも現れず、左ガターの
 * 行番号もその行を飛ばす。実際、一度「空行1行は普通の段落区切りだから追加ノード無し
 * （N 行 → N-1 個）」へ変更したところ、`## 見出し` の下の空行3行が2行しか表示されず
 * ガター番号が `1, 3, 4, 5` と 2 を飛ばす状態になり、ユーザー報告で差し戻した。
 * Raw と Preview の行が 1:1 で対応することを優先する。
 *
 * ここでは「空行 N 行 → 見える空行ブロック N 個」「ガター番号が Raw と同じ連番になる」、
 * および Enter → Markdown 自動変換（`hardbreakLine.ts` の分割）の結果が、同じ内容を
 * 開き直したときの見え方と一致することを、実 DOM と保存 Markdown の両方で固定する。
 *
 * 実行: `npm run test:browser`。ブラウザが無い環境では skip。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openPreview, type PreviewHandle } from '../previewBrowserHarness';

describe('実ブラウザ: 空行の表示本数（ソースの空行を省略しない）', function () {
    this.timeout(120000);

    let browser: Browser | null = null;
    let h: PreviewHandle | undefined;

    before(async () => { browser = await launchBrowser(); });
    after(async function () { this.timeout(20000); await browser?.close(); });
    afterEach(async () => { if (h) { await h.close(); h = undefined; } });

    /** エディタ直下のトップレベルブロックのテキスト（行番号ガター込み）を返す。 */
    async function blockTexts(handle: PreviewHandle): Promise<string[]> {
        return handle.page.evaluate(() => {
            const root = document.getElementById('milkdown-root');
            const editor = root?.querySelector('.ProseMirror') ?? root;
            return Array.from(editor?.children ?? []).map((el) => (el as HTMLElement).innerText);
        });
    }

    async function gutterNumbers(handle: PreviewHandle): Promise<string[]> {
        return handle.page.evaluate(() =>
            Array.from(document.querySelectorAll('.line-number-gutter')).map((e) => e.textContent || '')
        );
    }

    it('空行1行で区切られた2段落は、その空行ぶんの空ブロックを1つ表示する', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, 'AAA\n\nBBB\n', 'AAA');

        const model = await h.model();
        assert.deepStrictEqual(model.topTypes, ['paragraph', 'paragraph', 'paragraph'], model.outline);
        assert.strictEqual((await blockTexts(h)).length, 3, 'ソースの空行が表示から省略されている');
        assert.deepStrictEqual(h.errors, []);
    });

    it('空行2行なら、Preview に見える空行ブロックが2つ現れる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, 'AAA\n\n\nBBB\n', 'AAA');

        const model = await h.model();
        assert.deepStrictEqual(
            model.topTypes,
            ['paragraph', 'paragraph', 'paragraph', 'paragraph'],
            model.outline
        );
        assert.strictEqual((await blockTexts(h)).length, 4);
        assert.deepStrictEqual(h.errors, []);
    });

    it('見出しの下に空行が3行あると、ガター番号は 1,2,3,4,5 と Raw と同じ連番になる', async function () {
        if (!browser) { this.skip(); return; }
        // ユーザー報告そのままの形（CHANGELOG.md の冒頭）。修正前は 2 が飛んで
        // `1, 3, 4, 5` になり、空行3行のうち1行が表示から消えていた。
        h = await openPreview(browser, '## 1.9.10 - 2026-07-01\n\n\n\n- Fix: something\n', 'Fix');

        assert.deepStrictEqual(await gutterNumbers(h), ['1', '2', '3', '4', '5']);
        assert.deepStrictEqual(h.errors, []);
    });

    it('空行1行の文書を編集して保存しても、空行は1行のまま増えない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, 'AAA\n\nBBB\n', 'AAA');
        await h.placeCursorAfterText('AAA');
        await h.type('X');

        await h.waitForMarkdown('AAAX\n\nBBB\n');
        assert.deepStrictEqual(h.errors, []);
    });

    it('Enter の直後に見出し記法へ自動変換しても、保存される空行は1行のまま', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, 'abc\n\nTAIL\n', 'abc');
        await h.placeCursorAfterText('abc');
        await h.press('Enter');
        await h.type('## head');

        // 空行プレースホルダ段落を挟む＝同じ内容を開き直したときの見え方
        // （`abc` / 空行 / `## head` / 空行 / `TAIL`）と一致する。
        const model = await h.model();
        assert.deepStrictEqual(
            model.topTypes,
            ['paragraph', 'paragraph', 'heading', 'paragraph', 'paragraph'],
            model.outline
        );

        // プレフィックス展開中（`## ` が実テキストのまま）はホストへの同期が抑制される
        // ため、別ブロックへ移動して折りたたみ（＝postChange）を起こしてから検証する。
        await h.placeCursorAfterText('TAIL');
        await h.waitForMarkdown('abc\n\n## head\n\nTAIL\n');
        assert.deepStrictEqual(h.errors, []);
    });

    it('Enter の直後に箇条書き記法へ自動変換しても、保存される空行は1行のまま', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, 'abc\n\nTAIL\n', 'abc');
        await h.placeCursorAfterText('abc');
        await h.press('Enter');
        await h.type('- item');

        const model = await h.model();
        assert.deepStrictEqual(
            model.topTypes,
            ['paragraph', 'paragraph', 'bullet_list', 'paragraph', 'paragraph'],
            model.outline
        );

        await h.placeCursorAfterText('TAIL');
        await h.waitForMarkdown('abc\n\n- item\n\nTAIL\n');
        assert.deepStrictEqual(h.errors, []);
    });
});
