/**
 * 実ブラウザ回帰テスト: Preview の編集操作。
 *
 * Enter 継続 / リストのインデント / 各種 Backspace / Undo・Redo など、実際の編集で
 * 壊れやすい操作を実バンドルで検証する。カーソル位置はキー（End/Home）に依存せず
 * **プログラム的に**確定させ、テスト手法の不安定さを排除している
 * （Playwright→Milkdown では End / Cmd+A が効かないため）。
 *
 * 各テストは結果構造に加えて **page error が無いこと**を必須でアサートする。
 * 実行: `npm run test:browser`。ブラウザが無い環境では skip。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openPreview, type PreviewHandle } from '../previewBrowserHarness';

describe('実ブラウザ: Preview 編集操作', function () {
    this.timeout(120000);

    let browser: Browser | null = null;
    let h: PreviewHandle | undefined;

    before(async () => { browser = await launchBrowser(); });
    after(async () => { await browser?.close(); });
    afterEach(async () => { if (h) { await h.close(); h = undefined; } });

    // ── Enter 継続 ───────────────────────────────────────────────
    describe('Enter による継続', () => {
        it('段落の行末で Enter → 新しい段落ができ、内容は分割されない', async function () {
            if (!browser) { this.skip(); return; }
            h = await openPreview(browser, 'hello world\n\nTAIL\n', 'hello world');
            await h.placeCursorAfterText('hello world');
            await h.press('Enter');
            await h.type('next');
            const m = await h.model();
            assert.ok(m.outline.includes('paragraph["hello world"]'), m.outline);
            assert.ok(m.outline.includes('paragraph["next"]'), m.outline);
            assert.deepStrictEqual(h.errors, []);
        });

        it('箇条書きの行末で Enter → 新項目ができ、元の項目は保持される', async function () {
            if (!browser) { this.skip(); return; }
            h = await openPreview(browser, '- item one\n\nTAIL\n', 'item one');
            await h.placeCursorAfterText('item one');
            await h.press('Enter');
            const m = await h.model();
            // 1 項目目は "item one" のまま、リスト項目が 2 つになる
            assert.ok(m.outline.includes('list_item(checked=null)[paragraph["item one"]]'), m.outline);
            const itemCount = (m.outline.match(/list_item/g) || []).length;
            assert.strictEqual(itemCount, 2, `項目数が2でない: ${m.outline}`);
            assert.deepStrictEqual(h.errors, []);
        });

        it('チェックボックスの行末で Enter → 新項目は未チェックで継続する', async function () {
            if (!browser) { this.skip(); return; }
            h = await openPreview(browser, '- [ ] task one\n\nTAIL\n', 'task one');
            await h.placeCursorAfterText('task one');
            await h.press('Enter');
            await h.type('next task');
            const m = await h.model();
            assert.ok(m.outline.includes('list_item(checked=false)[paragraph["task one"]]'), m.outline);
            assert.ok(m.outline.includes('list_item(checked=false)[paragraph["next task"]]'), m.outline);
            assert.deepStrictEqual(h.errors, []);
        });
    });

    // ── リストのインデント ───────────────────────────────────────
    describe('リストのインデント/アウトデント', () => {
        it('2番目の項目で Tab → 入れ子になり、Shift+Tab で戻る', async function () {
            if (!browser) { this.skip(); return; }
            h = await openPreview(browser, '- one\n- two\n- three\n\nTAIL\n', 'three');
            await h.placeCursorAfterText('two');
            await h.press('Tab');
            let m = await h.model();
            assert.ok(/bullet_list\[.*bullet_list\[/.test(m.outline), `入れ子になっていない: ${m.outline}`);
            await h.press('Shift+Tab');
            m = await h.model();
            assert.ok(!/bullet_list\[.*bullet_list\[/.test(m.outline), `アウトデントされていない: ${m.outline}`);
            assert.deepStrictEqual(h.errors, []);
        });
    });

    // ── 各種 Backspace（ブロック解除）───────────────────────────
    describe('行頭 Backspace によるブロック解除', () => {
        // 2026-07-09: codeFenceEditPlugin（code-fence-real-text-edit-fix.md）により、
        // フォーカス中は開始フェンス（```js\n）が実テキストとして「code line」の直前に
        // 挿入されている。そのため「行頭」で Backspace すると、フェンスの改行1文字を
        // 削って前の行と結合するだけになり（見出し等の focus-expand と同じ、実テキスト
        // 編集の一般的な挙動）、以前のような「即座に段落へ解除」にはならない。
        // 完全な解除は、開始フェンスの ``` を全部消してフォーカスを外したときに起きる
        // （`test/browser/focus-expand/codeFenceRealTextEdit.test.ts` で検証済み）。
        it('コードブロックの先頭で Backspace → 開始フェンスの改行が1文字削除される（即座には段落解除されない）', async function () {
            if (!browser) { this.skip(); return; }
            h = await openPreview(browser, '```js\ncode line\n```\n\nTAIL\n', 'code line');
            // フォーカス中は実テキストの開始フェンス（```js\n）が「code line」の直前の行に
            // なるため、`placeCursorAtLineStart` のようなピクセル座標クリックは
            // （マッチした要素の先頭付近をクリックする都合上）フェンス行を拾ってしまう。
            // ドキュメントモデル上の位置で確実に指定できる `placeCursorBeforeText` を使う。
            await h.placeCursorBeforeText('code line');
            await h.press('Backspace');
            const m = await h.model();
            assert.ok(m.topTypes.includes('code_block'), `即座に段落解除されるのは意図しない挙動: ${m.outline}`);
            assert.ok(m.text.includes('```jscode line'), `開始フェンスの改行が1文字削除された結果になっていない: ${JSON.stringify(m.text)}`);
            assert.deepStrictEqual(h.errors, []);
        });

        it('引用の先頭で Backspace してもクラッシュしない', async function () {
            if (!browser) { this.skip(); return; }
            h = await openPreview(browser, '> quoted line\n\nTAIL\n', 'quoted line');
            await h.placeCursorAtLineStart('quoted line');
            await h.press('Backspace');
            const m = await h.model();
            assert.ok(m.text.includes('quoted line'), '内容が失われた');
            assert.deepStrictEqual(h.errors, []);
        });
    });

    // ── 段落の分割と結合 ────────────────────────────────────────
    describe('段落の分割と結合', () => {
        it('段落途中で Enter 分割 → 先頭 Backspace で元通り結合できる', async function () {
            if (!browser) { this.skip(); return; }
            h = await openPreview(browser, 'hello world\n\nTAIL\n', 'hello world');
            await h.placeCursorAfterText('hello');
            await h.press('Enter');
            let m = await h.model();
            assert.ok(m.outline.includes('paragraph["hello"]'), `分割されていない: ${m.outline}`);
            // 先頭 Backspace で結合
            await h.placeCursorAtLineStart('world');
            await h.press('Backspace');
            m = await h.model();
            assert.ok(m.text.includes('helloworld') || m.text.includes('hello world'), `結合されていない: ${m.outline}`);
            assert.deepStrictEqual(h.errors, []);
        });
    });

    // ── インラインマークの解除（実 DOM カーソルでマーク端 Backspace）──
    // jsdom 側 inlineMarkBackspace はプログラム的 setCursor で検証するが、実 DOM の
    // カーソルがマーク端にある状態の実キー操作はここでしか守れない。
    describe('インラインマーク端の Backspace（実マーカー文字を1文字ずつ編集）', () => {
        // 【仕様変更】以前は "bold" 直後での Backspace 1回でマーク全体が即座に外れていたが、
        // inlineMarkEditPlugin の導入により、フォーカス中は "**" 等のマーカーが実テキストと
        // して見え、文字単位で編集・削除できるようになった（見出しの "## " が実テキスト化
        // されて以来 markerBackspace の「先頭 Backspace で1段階降格」が発火しなくなったのと
        // 同じトレードオフ。inline-mark-focus-edit-fix.md 参照）。
        // "bold" 直後（= マーカーの手前）での Backspace は、マーカーではなく本文の最後の
        // 文字を1文字削除する（マーカーそのものを消すには、閉じマーカーの後ろまでカーソルを
        // 進めてから Backspace する）。
        it('太字の直後（マーカーの手前）で Backspace → マーカーではなく本文の最後の文字が消える', async function () {
            if (!browser) { this.skip(); return; }
            h = await openPreview(browser, 'x **bold** y\n', 'bold');
            await h.placeCursorAfterText('bold');
            await h.press('Backspace');
            const m = await h.model();
            assert.ok(m.outline.includes('{strong}'), `太字マークは維持されるはず: ${m.outline}`);
            assert.ok(m.text.includes('bol') && !m.text.includes('bold'), `本文の最後の文字(d)が消えるはず: ${JSON.stringify(m.text)}`);
            assert.deepStrictEqual(h.errors, []);
        });

        it('太字の閉じマーカーの後ろまで進めてから Backspace を2回 → マーカーが1文字ずつ消え、最後に太字が外れる', async function () {
            if (!browser) { this.skip(); return; }
            // inlineMarkEditPlugin はブロック単位で expand/collapse するため、collapse を
            // 発火させるには別ブロック（別段落）へフォーカスを移す必要がある
            // （同一段落内でのカーソル移動だけでは何も確定しない）。
            h = await openPreview(browser, 'x **bold** y\n\n次の段落\n', 'bold');
            await h.placeCursorAfterText('bold');
            await h.press('ArrowRight');
            await h.press('ArrowRight');
            await h.press('Backspace');
            await h.press('Backspace');
            await h.placeCursorAfterText('次の段落');
            await h.page.waitForTimeout(150);
            const m = await h.model();
            assert.ok(!m.outline.includes('{strong}') && !m.outline.includes('{emphasis}'), `太字が外れているはず: ${m.outline}`);
            assert.ok(m.text.includes('bold'), 'テキストが消えた');
            assert.deepStrictEqual(h.errors, []);
        });

        it('インラインコードの直後（マーカーの手前）で Backspace → マーカーではなく本文の最後の文字が消える', async function () {
            if (!browser) { this.skip(); return; }
            h = await openPreview(browser, 'x `code` y\n', 'code');
            await h.placeCursorAfterText('code');
            await h.press('Backspace');
            const m = await h.model();
            assert.ok(/\{.*(inlineCode|code).*\}/.test(m.outline), `inlineCode マークは維持されるはず: ${m.outline}`);
            assert.ok(m.text.includes('cod') && !m.text.includes('code'), `本文の最後の文字(e)が消えるはず: ${JSON.stringify(m.text)}`);
            assert.deepStrictEqual(h.errors, []);
        });

        it('インラインコードの閉じマーカーの後ろまで進めてから Backspace → コードが外れる', async function () {
            if (!browser) { this.skip(); return; }
            h = await openPreview(browser, 'x `code` y\n\n次の段落\n', 'code');
            await h.placeCursorAfterText('code');
            await h.press('ArrowRight');
            await h.press('Backspace');
            await h.placeCursorAfterText('次の段落');
            await h.page.waitForTimeout(150);
            const m = await h.model();
            assert.ok(!/\{.*(inlineCode|code).*\}/.test(m.outline), `コードが外れているはず: ${m.outline}`);
            assert.ok(m.text.includes('code'), 'テキストが消えた');
            assert.deepStrictEqual(h.errors, []);
        });
    });

    // ── テーブルのカーソル移動（実矢印キー）──────────────────
    // jsdom 側 tableArrowKeymap は純関数 tableCellVerticalTarget を直接呼ぶだけ。
    // 実矢印キーでの実セル移動はここでしか守れない。
    describe('テーブルのセル間カーソル移動（実キー）', () => {
        it('↓ で真下のセルへ（列を保つ）、↑ で戻る', async function () {
            if (!browser) { this.skip(); return; }
            h = await openPreview(browser, '| a1 | b1 |\n| --- | --- |\n| a2 | b2 |\n| a3 | b3 |\n\nTAIL\n', 'a3');
            await h.placeCursorAfterText('a2');
            await h.press('ArrowDown');
            assert.strictEqual((await h.model()).selParentText, 'a3', '真下(a3)へ移動していない');
            await h.press('ArrowUp');
            assert.strictEqual((await h.model()).selParentText, 'a2', '真上(a2)へ戻っていない');
            assert.deepStrictEqual(h.errors, []);
        });

        it('→ で隣のセルへ移る', async function () {
            if (!browser) { this.skip(); return; }
            h = await openPreview(browser, '| a1 | b1 |\n| --- | --- |\n| a2 | b2 |\n\nTAIL\n', 'b2');
            await h.placeCursorAfterText('a2');
            await h.press('ArrowRight');
            assert.strictEqual((await h.model()).selParentText, 'b2', '隣(b2)へ移動していない');
            assert.deepStrictEqual(h.errors, []);
        });

        it('3列テーブルの2列目で ↓ → 列を保って真下のセルへ', async function () {
            if (!browser) { this.skip(); return; }
            h = await openPreview(browser, '| a1 | b1 | c1 |\n| --- | --- | --- |\n| a2 | b2 | c2 |\n\nTAIL\n', 'c2');
            await h.placeCursorAfterText('b1');
            await h.press('ArrowDown');
            assert.strictEqual((await h.model()).selParentText, 'b2', '2列目の真下(b2)へ移動していない（a2 や c2 に飛んでいる可能性）');
            assert.deepStrictEqual(h.errors, []);
        });

        it('3列テーブルの3列目（最終列）で ↓ → 列を保って真下のセルへ', async function () {
            if (!browser) { this.skip(); return; }
            h = await openPreview(browser, '| a1 | b1 | c1 |\n| --- | --- | --- |\n| a2 | b2 | c2 |\n\nTAIL\n', 'c2');
            await h.placeCursorAfterText('c1');
            await h.press('ArrowDown');
            assert.strictEqual((await h.model()).selParentText, 'c2', '3列目の真下(c2)へ移動していない（a2 に飛んでいる可能性）');
            assert.deepStrictEqual(h.errors, []);
        });

        it('移動先セルが空でも ↓ で同列の真下セルへ（分析シートバグ再現）', async function () {
            // スクリーンショットの再現: 3列テーブルで col3 に内容、col2 は空、
            // 次行は col1 のみ内容あり（col2/col3 は空）。
            // ↓ を押すと col1（10:00→11:00）に飛ぶバグ。
            if (!browser) { this.skip(); return; }
            const md = '| 10:00 ~ |  | 分析シート |\n| --- | --- | --- |\n| 11:00 ~ |  |  |\n\nTAIL\n';
            h = await openPreview(browser, md, 'TAIL');
            await h.placeCursorAfterText('分析シート');
            await h.press('ArrowDown');
            const m = await h.model();
            // カーソルが col1 の "11:00 ~" に飛んでいないこと
            assert.ok(
                m.selParentText !== '11:00 ~',
                `col1（11:00 ~）に飛んでしまった: selParentText="${m.selParentText}" outline="${m.outline}"`
            );
            assert.deepStrictEqual(h.errors, []);
        });

        it('セル内テキストの先頭（中間）で ↓ → 同列の真下セルへ（ブラウザ任せで列ずれするバグ）', async function () {
            // カーソルがセル末尾でなく先頭 or 中間にある状態での ↓。
            // atCellEdge が textOffset > 0 で false を返しブラウザが処理
            // → 列がずれて col1 に飛ぶバグ（分析シートバグの本質）。
            // 狭いビューポート (400px) で再現しやすい。
            if (!browser) { this.skip(); return; }
            const md = '| 10:00 ~ |  | 分析シート |\n| --- | --- | --- |\n| 11:00 ~ |  |  |\n\nTAIL\n';
            // 幅 400px の狭いビューポートで開く（VS Code の狭いパネルに近い）
            h = await openPreview(browser, md, 'TAIL', { showToolbar: false });
            await h.page.setViewportSize({ width: 400, height: 700 });
            await h.page.waitForTimeout(100);
            // col3「分析シート」のテキスト先頭（中間）にカーソルを置く
            /* eslint-disable @typescript-eslint/no-explicit-any */
            await h.page.evaluate(() => {
                const view = (window as any).__view;
                const { doc, tr } = view.state;
                const TextSelection = view.state.selection.constructor;
                let targetPos: number | null = null;
                doc.descendants((node: any, pos: number) => {
                    if (node.isText && node.text === '分析シート') {
                        targetPos = pos + 2; // テキスト中間位置（textOffset=2）
                        return false;
                    }
                    return true;
                });
                if (targetPos !== null) {
                    view.dispatch(tr.setSelection(TextSelection.create(doc, targetPos)).scrollIntoView());
                    view.focus();
                }
            });
            /* eslint-enable @typescript-eslint/no-explicit-any */
            await h.page.waitForTimeout(150);
            await h.press('ArrowDown');
            await h.page.waitForTimeout(200);
            const m = await h.model();
            // col1（11:00 ~）に飛んでいないこと
            assert.ok(
                m.selParentText !== '11:00 ~',
                `テキスト中間から ↓ → col1（11:00 ~）に飛んだ: selParentText="${m.selParentText}"`
            );
            assert.deepStrictEqual(h.errors, []);
        });

        it('セル内テキストが選択状態（non-empty）で ↓ → 同列の真下セルへ（分析シートバグ再現）', async function () {
            // 「分析シート」がテキスト選択（ハイライト）された状態で ↓ を押すと、
            // !sel.empty チェックで plugin が false を返し、ブラウザが col1（11:00 ~）に飛ぶバグ。
            if (!browser) { this.skip(); return; }
            const md = '| 10:00 ~ |  | 分析シート |\n| --- | --- | --- |\n| 11:00 ~ |  |  |\n\nTAIL\n';
            h = await openPreview(browser, md, 'TAIL');
            await h.selectText('分析シート'); // 分析シート
            await h.press('ArrowDown');
            await h.page.waitForTimeout(200);
            const m = await h.model();
            assert.ok(
                m.selParentText !== '11:00 ~',
                `テキスト選択状態から ↓ → col1（11:00 ~）に飛んだ: selParentText="${m.selParentText}"`
            );
            assert.deepStrictEqual(h.errors, []);
        });
    });

    // ── Undo / Redo ─────────────────────────────────────────────
    describe('Undo / Redo', () => {
        it('Cmd+B の太字付与を Cmd+Z で取り消し、Cmd+Shift+Z でやり直せる', async function () {
            if (!browser) { this.skip(); return; }
            h = await openPreview(browser, 'undo me text\n', 'undo me');
            await h.selectText('undo me');
            await h.press('Meta+b');
            assert.ok((await h.model()).outline.includes('"undo me"{strong}'), '太字が付いていない');
            await h.press('Meta+z');
            assert.ok(!(await h.model()).outline.includes('{strong}'), 'Undo で太字が消えていない');
            await h.press('Meta+Shift+z');
            assert.ok((await h.model()).outline.includes('{strong}'), 'Redo で太字が戻っていない');
            assert.deepStrictEqual(h.errors, []);
        });
    });
});
