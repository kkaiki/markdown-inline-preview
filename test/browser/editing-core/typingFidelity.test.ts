/**
 * 実ブラウザ回帰テスト: タイプ中・確定後の「文字忠実性」。
 *
 * 目的:
 *   既存の basicOperations/editingOperations は最終結果の**構造**を `includes` で
 *   見ているだけで、途中経過と厳密一致（`===`）は見ていない。本ファイルは 1 打鍵ごとに
 *   doc 全体のテキストを `assert.strictEqual` で突き合わせ、「途中の1文字だけ余分/欠落」
 *   「冒頭が二重化する」といった崩れを検出できるようにする
 *   （未再現のユーザー報告「連続した日本語入力で冒頭が二重化する」に対する最も細かい網）。
 *
 * `docs/specifications/typing-fidelity-test-proposal.md` §4.1 の TDD 実装。
 * 実行: `npm run test:browser`。ブラウザが無い環境では skip。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openPreview, type PreviewHandle } from '../previewBrowserHarness';
import { typeCharByCharExact } from '../typingFidelityHelpers';

describe('実ブラウザ: タイプ中・確定後の文字忠実性', function () {
    this.timeout(180000);

    let browser: Browser | null = null;
    let h: PreviewHandle | undefined;

    before(async () => { browser = await launchBrowser(); });
    after(async function () { this.timeout(20000); await browser?.close(); });
    afterEach(async () => { if (h) { await h.close(); h = undefined; } });

    // ───────────────────────────────────────────────────────────
    // プレーンな文字列
    // ───────────────────────────────────────────────────────────
    describe('プレーンな文字列（空段落へ1文字ずつ）', () => {
        const cases: Array<[string, string]> = [
            ['ASCII 小文字のみ', 'hello world'],
            ['大文字・数字混在', 'Test123 CASE'],
            ['連続スペース', 'a  b   c'],
            ['ASCII 句読点', `. , ! ? : ; ' "`],
            ['日本語直接タイプ（IME を通さない）', 'こんにちは世界'],
            ['日本語句読点', '、。「」・ー'],
            ['日英混在', '今日はTypeScriptを3時間書いた。'],
            ['全角英数', 'ＡＢＣ１２３'],
            ['絵文字（サロゲートペア・異体字セレクタ）', '👍🎉☝🏻'],
            ['NFD 結合文字（か + 濁点）', 'がきゅうり']
        ];
        for (const [label, text] of cases) {
            it(`${label}「${text}」を1文字ずつ打っても、各時点で全文が厳密一致する`, async function () {
                if (!browser) { this.skip(); return; }
                h = await openPreview(browser, '\n', undefined);
                await h.focusEditor();
                await typeCharByCharExact(h, text, () => h.docText(), (typedSoFar) => typedSoFar);
                assert.deepStrictEqual(h.errors, []);
            });
        }

        it('長文200文字を打鍵間ウェイトなしで連続タイプしても、最終結果が厳密一致する', async function () {
            if (!browser) { this.skip(); return; }
            h = await openPreview(browser, '\n', undefined);
            await h.focusEditor();
            const long = 'あいうえおかきくけこさしすせそたちつてとなにぬねの'.repeat(8); // 25 chars × 8 = 200
            assert.strictEqual(long.length, 200);
            await h.page.keyboard.type(long, { delay: 0 });
            await h.page.waitForTimeout(300);
            const actual = await h.docText();
            assert.strictEqual(actual, long, `長文高速タイプで崩れた: 期待 ${long.length}文字, 実際 ${actual.length}文字`);
            assert.deepStrictEqual(h.errors, []);
        });
    });

    // ───────────────────────────────────────────────────────────
    // カーソル位置バリエーション
    // ───────────────────────────────────────────────────────────
    describe('カーソル位置バリエーション', () => {
        it('既存段落の先頭に打つ（冒頭挿入 = ユーザー報告の症状位置）', async function () {
            if (!browser) { this.skip(); return; }
            h = await openPreview(browser, '既存の本文です\n', '既存の本文です');
            await h.placeCursorBeforeText('既存の本文です');
            const suffix = '既存の本文です';
            const typed = 'このアプリで、Aという文章を編集しているとして、';
            await typeCharByCharExact(h, typed, () => h.docText(), (typedSoFar) => typedSoFar + suffix);
            const finalText = await h.docText();
            assert.strictEqual(finalText, typed + suffix);
            assert.ok(!finalText.includes('このアプリでこのアプリで'), `冒頭が二重化した: ${JSON.stringify(finalText)}`);
            assert.deepStrictEqual(h.errors, []);
        });

        it('既存段落の末尾から続けて打つ', async function () {
            if (!browser) { this.skip(); return; }
            h = await openPreview(browser, 'prefix text\n', 'prefix text');
            await h.placeCursorAfterText('prefix text');
            const prefix = 'prefix text';
            const typed = ' and more';
            await typeCharByCharExact(h, typed, () => h.docText(), (typedSoFar) => prefix + typedSoFar);
            assert.deepStrictEqual(h.errors, []);
        });

        it('既存段落の中央に打つ', async function () {
            if (!browser) { this.skip(); return; }
            h = await openPreview(browser, 'headtail\n', 'headtail');
            await h.placeCursorAfterText('head');
            const typed = 'MIDDLE';
            await typeCharByCharExact(h, typed, () => h.docText(), (typedSoFar) => 'head' + typedSoFar + 'tail');
            assert.deepStrictEqual(h.errors, []);
        });

        it('空ドキュメントに最初の1文字から打つ', async function () {
            if (!browser) { this.skip(); return; }
            h = await openPreview(browser, '\n', undefined);
            await h.focusEditor();
            await typeCharByCharExact(h, 'first', () => h.docText(), (typedSoFar) => typedSoFar);
            assert.deepStrictEqual(h.errors, []);
        });

        it('文書の最終ブロック末尾（境界 pos）で打つ', async function () {
            if (!browser) { this.skip(); return; }
            h = await openPreview(browser, '# H\n\nbody\n', 'body');
            await h.moveToEnd();
            const typed = 'tail-append';
            await typeCharByCharExact(h, typed, () => h.docText(), (typedSoFar) => `H\nbody\n${typedSoFar}`);
            assert.deepStrictEqual(h.errors, []);
        });
    });

    // ───────────────────────────────────────────────────────────
    // ブロック種別ごとの本文タイプ
    // ───────────────────────────────────────────────────────────
    describe('ブロック種別ごとの本文タイプ', () => {
        // 見出し・リスト・blockquote はカーソルが入る（フォーカスされる）と
        // Typora 風フォーカス展開により `# `/`- `/`1. `/`> ` が装飾からリテラル
        // テキストへ展開される（blockPrefixEditPlugin）。placeCursorBeforeText で
        // カーソルを入れた時点で既に展開済みになるため、期待値にも同じプレフィックスを含める。

        it('見出し本文に打っても表示・markdown が厳密一致する', async function () {
            if (!browser) { this.skip(); return; }
            // 見出しがフォーカス展開されている間（"# " がリテラルテキストとして
            // 展開中）は markdownUpdated → postChange が抑制される
            // （collapse-markdown-sync-fix.md）ため、collapse させる別ブロックを用意する。
            h = await openPreview(browser, '# TAIL\n\nOTHER\n', 'TAIL');
            await h.placeCursorBeforeText('TAIL');
            const before = await h.docText(); // フォーカス展開済み（"# TAIL"）を実測してベースにする
            await typeCharByCharExact(h, 'Intro-', () => h.docText(), (typedSoFar) => before.replace('TAIL', typedSoFar + 'TAIL'));
            await h.placeCursorAfterText('OTHER'); // 見出しから離れ collapse させる
            await h.page.waitForTimeout(300);
            const md = await h.lastChangeMarkdown();
            assert.ok(md && md.includes('# Intro-TAIL'), md ?? 'null');
            assert.deepStrictEqual(h.errors, []);
        });

        it('箇条書き項目の本文に打っても厳密一致する', async function () {
            if (!browser) { this.skip(); return; }
            h = await openPreview(browser, '- TAIL\n', 'TAIL');
            await h.placeCursorBeforeText('TAIL');
            const before = await h.docText();
            await typeCharByCharExact(h, 'item-', () => h.docText(), (typedSoFar) => before.replace('TAIL', typedSoFar + 'TAIL'));
            assert.deepStrictEqual(h.errors, []);
        });

        it('番号付きリスト項目の本文に打っても厳密一致する', async function () {
            if (!browser) { this.skip(); return; }
            h = await openPreview(browser, '1. TAIL\n', 'TAIL');
            await h.placeCursorBeforeText('TAIL');
            const before = await h.docText();
            await typeCharByCharExact(h, 'num-', () => h.docText(), (typedSoFar) => before.replace('TAIL', typedSoFar + 'TAIL'));
            assert.deepStrictEqual(h.errors, []);
        });

        it('チェックボックスラベルに打っても checked が反転せず厳密一致する', async function () {
            if (!browser) { this.skip(); return; }
            h = await openPreview(browser, '- [x] TAIL\n', 'TAIL');
            await h.placeCursorBeforeText('TAIL');
            const before = await h.docText();
            await typeCharByCharExact(h, 'done-', () => h.docText(), (typedSoFar) => before.replace('TAIL', typedSoFar + 'TAIL'));
            const m = await h.model();
            assert.ok(m.outline.includes('checked=true'), m.outline);
            assert.deepStrictEqual(h.errors, []);
        });

        it('blockquote 本文に打っても厳密一致する', async function () {
            if (!browser) { this.skip(); return; }
            h = await openPreview(browser, '> TAIL\n', 'TAIL');
            await h.placeCursorBeforeText('TAIL');
            const before = await h.docText();
            await typeCharByCharExact(h, 'quote-', () => h.docText(), (typedSoFar) => before.replace('TAIL', typedSoFar + 'TAIL'));
            assert.deepStrictEqual(h.errors, []);
        });

        it('インラインコード内に打っても input rule が発火せず文字がそのまま残る', async function () {
            if (!browser) { this.skip(); return; }
            // フォーカス中はインラインマーカー（\` \`）も実テキストとして展開されうる
            // （inlineMarkEditPlugin）ため、展開後の実際の表示を実測してベースにする。
            h = await openPreview(browser, '`codeTAIL`\n', 'codeTAIL');
            await h.placeCursorBeforeText('TAIL');
            const before = await h.docText();
            await typeCharByCharExact(h, '_mid_', () => h.docText(), (typedSoFar) => before.replace('TAIL', typedSoFar + 'TAIL'));
            assert.deepStrictEqual(h.errors, []);
        });

        it('fenced code block 内で "#" や "- " を打っても変換されずインデントも保持される', async function () {
            if (!browser) { this.skip(); return; }
            h = await openPreview(browser, '```js\nTAIL\n```\n', 'TAIL');
            await h.placeCursorBeforeText('TAIL');
            const typed = '# not-heading\n  - not-list\n';
            await typeCharByCharExact(h, typed, () => h.docText(), (typedSoFar) => typedSoFar + 'TAIL');
            const m = await h.model();
            assert.ok(m.topTypes.includes('code_block'), m.outline);
            assert.deepStrictEqual(h.errors, []);
        });

        it('テーブルセル内（パイプ以外の通常文字）に打っても厳密一致する', async function () {
            if (!browser) { this.skip(); return; }
            h = await openPreview(browser, '| a | b |\n| - | - |\n| x | TAIL |\n', 'TAIL');
            await h.placeCursorBeforeText('TAIL');
            await typeCharByCharExact(h, 'cell-', () => h.docText(), (typedSoFar) => `a\nb\nx\n${typedSoFar}TAIL`);
            assert.deepStrictEqual(h.errors, []);
        });
    });

    // ───────────────────────────────────────────────────────────
    // 編集を挟むタイプ
    // ───────────────────────────────────────────────────────────
    describe('編集を挟むタイプ', () => {
        it('タイプ → Backspace 数回 → 打ち直し で最終文字列が厳密一致する', async function () {
            if (!browser) { this.skip(); return; }
            h = await openPreview(browser, '\n', undefined);
            await h.focusEditor();
            await h.type('helloXXX');
            await h.press('Backspace');
            await h.press('Backspace');
            await h.press('Backspace');
            await h.type('world');
            const actual = await h.docText();
            assert.strictEqual(actual, 'helloworld');
            assert.deepStrictEqual(h.errors, []);
        });

        it('タイプ途中で ←← と戻って中央挿入しても最終文字列が厳密一致する', async function () {
            if (!browser) { this.skip(); return; }
            h = await openPreview(browser, '\n', undefined);
            await h.focusEditor();
            await h.type('headtail');
            await h.press('ArrowLeft');
            await h.press('ArrowLeft');
            await h.press('ArrowLeft');
            await h.press('ArrowLeft');
            await h.type('MID');
            const actual = await h.docText();
            assert.strictEqual(actual, 'headMIDtail');
            assert.deepStrictEqual(h.errors, []);
        });

        it('タイプ → Undo → 再タイプ → Undo → Redo の後の全文が厳密一致する', async function () {
            if (!browser) { this.skip(); return; }
            h = await openPreview(browser, '\n', undefined);
            await h.focusEditor();
            // history のグルーピング窓（既定 ~500ms）をまたぐよう、各操作の間を
            // 意図的に空けて「1タイプ = 1 undo 単位」になるようにする。
            await h.type('first');
            await h.page.waitForTimeout(600);
            await h.type(' second');
            await h.page.waitForTimeout(600);
            await h.press('Meta+z'); // " second" だけ取り消し
            const afterUndo1 = await h.docText();
            assert.strictEqual(afterUndo1, 'first');
            await h.type(' third');
            await h.page.waitForTimeout(600);
            await h.press('Meta+z'); // " third" だけ取り消し
            const afterUndo2 = await h.docText();
            assert.strictEqual(afterUndo2, 'first');
            await h.press('Meta+Shift+z'); // " third" を再度やり直し
            const actual = await h.docText();
            assert.strictEqual(actual, 'first third');
            assert.deepStrictEqual(h.errors, []);
        });

        it('2つの段落を行き来しながら交互に追記しても、それぞれ厳密一致する', async function () {
            if (!browser) { this.skip(); return; }
            h = await openPreview(browser, 'ALPHA\n\nBETA\n', 'BETA');
            await h.placeCursorAfterText('ALPHA');
            await h.type('-1');
            await h.placeCursorAfterText('BETA');
            await h.type('-1');
            await h.placeCursorAfterText('ALPHA-1');
            await h.type('-2');
            await h.placeCursorAfterText('BETA-1');
            await h.type('-2');
            const actual = await h.docText();
            assert.strictEqual(actual, 'ALPHA-1-2\nBETA-1-2');
            assert.deepStrictEqual(h.errors, []);
        });
    });
});
