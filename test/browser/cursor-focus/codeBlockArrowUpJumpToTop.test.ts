/**
 * 実ブラウザ回帰テスト（修正確認）: コードブロック内での ↑/↓（縦移動）。
 *
 * ユーザー報告: Python の `class` 定義など、コードブロックの1行目にある単語（クラス名）を
 * ダブルクリックで選択した状態で ↑ を押すと、直前の段落ではなく**文書の一番先頭**まで
 * カーソルが飛ぶ。
 *
 * 原因: フォーカス中のコードブロックは開始行（```lang）/終了行（```）を
 * `contenteditable="false"` の widget として表示する（`focusSyntaxPlugin.ts`、
 * `code-fence-focus-markers.md`）。この widget には改行文字を含むテキストが入っており、
 * ネイティブのキャレット上下移動がこの widget の境界をまたぐ際に DOM 位置を正しく
 * 解決できず、文書の先頭付近へキャレットが飛んでしまっていた（コードブロック末尾側の
 * 境界でも対称の問題があり、こちらは「最終行から下へ抜けられない」という形で現れる）。
 * `codeBlockArrowKeymap.ts` がコードブロック内の ↑/↓ を横取りし、`code_block` の生テキストを
 * 行分割して移動先を手動計算することで、ネイティブのキャレット移動を経由しないようにした。
 *
 * 実座標クリックについて: `page.getByText(...).click()` は要素境界（hljs のシンタックス
 * ハイライト `<span>` 分割等）に依存して意図しない位置をクリックすることがあるため、
 * ここでは `h.doubleClickTextAt` / `h.clickTextAt`（DOM Range から実座標を計算して
 * `page.mouse` で直接クリックする）を使う。
 *
 * 実行: `npm run test:browser`。ブラウザが無い環境では skip。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openPreview, type PreviewHandle } from '../previewBrowserHarness';

describe('修正確認: コードブロック内 ↑/↓ でブロック境界を正しく越える', function () {
    this.timeout(120000);

    let browser: Browser | null = null;
    let h: PreviewHandle | undefined;

    before(async () => { browser = await launchBrowser(); });
    after(async () => { await browser?.close(); });
    afterEach(async () => { if (h) { await h.close(); h = undefined; } });

    const md = [
        '文章1',
        '',
        '文章2',
        '',
        '文章3',
        '',
        '```python',
        'class InterviewStructuredData(BaseModel):',
        '    personal_mission: str | None = None',
        '    personality_traits: list[str] | None = None',
        '```',
        '',
        '見出し1',
        '',
        '見出し2',
        '',
        '見出し3'
    ].join('\n');

    it('コードブロック1行目の単語選択 → ArrowUp で、直前の段落（文書先頭ではない）へ抜ける', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, md, '見出し3');

        await h.doubleClickTextAt('InterviewStructuredData');
        await h.press('ArrowUp');

        const m = await h.model();
        assert.strictEqual(
            m.selParentText,
            '文章3',
            `ArrowUp がコードブロック直前の段落（文章3）ではなく別の場所へ飛んだ: selFrom=${m.selFrom}, selParentText=${JSON.stringify(m.selParentText)}`
        );
        assert.deepStrictEqual(h.errors, []);
    });

    it('コードブロック2行目の単語選択 → ArrowUp で、ブロック内の1行目へ留まる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, md, '見出し3');

        await h.doubleClickTextAt('personal_mission');
        await h.press('ArrowUp');

        const m = await h.model();
        assert.ok(
            m.selParentText.startsWith('class InterviewStructuredData'),
            `ArrowUp がコードブロックの外へ抜けてしまった: selFrom=${m.selFrom}, selParentText=${JSON.stringify(m.selParentText)}`
        );
        assert.deepStrictEqual(h.errors, []);
    });

    it('コードブロック3行目（最終行）の単語選択 → ArrowUp で、ブロック内の2行目へ留まる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, md, '見出し3');

        await h.doubleClickTextAt('personality_traits');
        await h.press('ArrowUp');

        const m = await h.model();
        assert.ok(
            m.selParentText.startsWith('class InterviewStructuredData'),
            `ArrowUp がコードブロックの外へ抜けてしまった: selFrom=${m.selFrom}, selParentText=${JSON.stringify(m.selParentText)}`
        );
        assert.deepStrictEqual(h.errors, []);
    });

    it('コードブロック2行目の単語選択 → ArrowDown で、ブロック内の3行目へ留まる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, md, '見出し3');

        await h.doubleClickTextAt('personal_mission');
        await h.press('ArrowDown');

        const m = await h.model();
        assert.ok(
            m.selParentText.startsWith('class InterviewStructuredData'),
            `ArrowDown がコードブロックの外へ抜けてしまった: selFrom=${m.selFrom}, selParentText=${JSON.stringify(m.selParentText)}`
        );
        assert.deepStrictEqual(h.errors, []);
    });

    it('コードブロック最終行の単語選択 → ArrowDown で、直後の見出し（ブロック内に留まらない）へ抜ける', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, md, '見出し3');

        await h.doubleClickTextAt('personality_traits');
        await h.press('ArrowDown');

        const m = await h.model();
        assert.strictEqual(
            m.selParentText,
            '見出し1',
            `ArrowDown がコードブロック直後の見出し（見出し1）へ抜けられなかった: selFrom=${m.selFrom}, selParentText=${JSON.stringify(m.selParentText)}`
        );
        assert.deepStrictEqual(h.errors, []);
    });
});
