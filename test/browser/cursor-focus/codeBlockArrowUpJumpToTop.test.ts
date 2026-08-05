/**
 * 実ブラウザ回帰テスト（修正確認）: コードブロック内での ↑/↓（縦移動）。
 *
 * ユーザー報告: Python の `class` 定義など、コードブロックの1行目にある単語（クラス名）を
 * ダブルクリックで選択した状態で ↑ を押すと、直前の段落ではなく**文書の一番先頭**まで
 * カーソルが飛ぶ。
 *
 * 原因: フォーカス中のコードブロックは開始行（```lang）/終了行（```）を
 * `contenteditable="false"` の widget として表示していた（`focusSyntaxPlugin.ts`）。
 * この widget には改行文字を含むテキストが入っており、ネイティブのキャレット上下移動が
 * この widget の境界をまたぐ際に DOM 位置を正しく解決できず、文書の先頭付近へキャレットが
 * 飛んでしまっていた（コードブロック末尾側の境界でも対称の問題があり、こちらは
 * 「最終行から下へ抜けられない」という形で現れる）。`codeBlockArrowKeymap.ts` が
 * コードブロック内の ↑/↓ を横取りし、`code_block` の生テキストを行分割して移動先を
 * 手動計算することで、ネイティブのキャレット移動を経由しないようにした。
 *
 * ## 2026-07-26 の仕様変更に伴う更新
 *
 * 記法の実テキスト展開を廃止した（`docs/specifications/no-focus-expand.md`）ため、
 * フォーカス中でもフェンス行はブロックの中身に存在しない。`codeBlockArrowKeymap.ts` の
 * 行分割（`node.textContent` を見るだけ）から見えるのは実コード行だけになり、
 * 最初の実コード行での ArrowUp は 1 回でブロックの外（直前の段落）へ抜ける。
 * 最終行での ArrowDown も対称に 1 回で外（直後の見出し）へ抜ける。
 *
 * 実座標クリックについて: `page.getByText(...).click()` は要素境界（hljs のシンタックス
 * ハイライト `<span>` 分割等）に依存して意図しない位置をクリックすることがあるため、
 * ここでは `h.doubleClickTextAt`（DOM Range から実座標を計算して `page.mouse` で直接
 * クリックする）を使う。`model().selParentText` は code_block ノード全体（複数行分）を
 * 返すため特定の行の判定に使えず、代わりに `currentLineText()`（カーソルのある行だけを
 * 切り出す）で検証する。
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

        const line = await h.currentLineText();
        assert.strictEqual(line, 'class InterviewStructuredData(BaseModel):', `ArrowUp が1行目へ留まらなかった: ${JSON.stringify(line)}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('コードブロック3行目（最終行）の単語選択 → ArrowUp で、ブロック内の2行目へ留まる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, md, '見出し3');

        await h.doubleClickTextAt('personality_traits');
        await h.press('ArrowUp');

        const line = await h.currentLineText();
        assert.strictEqual(line, '    personal_mission: str | None = None', `ArrowUp が2行目へ留まらなかった: ${JSON.stringify(line)}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('コードブロック2行目の単語選択 → ArrowDown で、ブロック内の3行目（最終行）へ留まる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, md, '見出し3');

        await h.doubleClickTextAt('personal_mission');
        await h.press('ArrowDown');

        const line = await h.currentLineText();
        assert.strictEqual(line, '    personality_traits: list[str] | None = None', `ArrowDown が3行目へ留まらなかった: ${JSON.stringify(line)}`);
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
