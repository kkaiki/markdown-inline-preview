/**
 * 実ブラウザ・ユースケーステスト: ユーザーが Markdown メモを書くときの**日常的な操作フロー**を
 * そのまま実キー入力で再現し、「この操作をしたら、こう動く」を保証する。
 *
 * docs/specifications/preview-usage-flow-test-backlog.md のバックログを消化するテスト群。
 * 個別のバグ再現ではなく、次のような「実際に毎日起きる操作の連なり」を対象にする:
 *
 *   - 買い物リストを一気に書き出す（チェックボックス + Enter の高速反復）
 *   - 会議メモ（見出し → チェックリスト → 見出し → チェックリスト）
 *   - 普通の箇条書きとチェックボックスを同じリスト内に混在させる
 *   - 書いた行の選択削除 → Undo、段落の分割 → 結合、といった編集の往復
 *   - テーブルセル内での誤操作（チェックボックス記法）でも壊れないこと
 *
 * いずれの操作でも (1) 文書構造が期待通り、(2) カーソルが意図した場所に残る、
 * (3) page error が発生しない、の 3 点を検証する。
 *
 * 実行: `npm run test:browser`。ブラウザが無い環境では skip。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openPreview, type PreviewHandle } from '../previewBrowserHarness';

describe('実ブラウザ: 実利用フロー（日常操作のユースケース）', function () {
    this.timeout(240000);

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

    /** 対象行の末尾にカーソルを合わせ、Enter で新しい行を作ってから typed をタイプする。 */
    async function typeOnNewLine(markdown: string, target: string, typed: string): Promise<PreviewHandle> {
        const handle = await openPreview(browser, markdown, target);
        await handle.placeCursorAfterText(target);
        await handle.press('Enter');
        await handle.page.waitForTimeout(150);
        await handle.type(typed);
        await handle.page.waitForTimeout(300);
        return handle;
    }

    /** fromText の先頭から toText の末尾までをモデル上で範囲選択する（行まるごと選択の再現）。 */
    async function selectRange(handle: PreviewHandle, fromText: string, toText: string): Promise<void> {
        /* eslint-disable @typescript-eslint/no-explicit-any */
        await handle.page.evaluate(([a, b]) => {
            const view = (window as any).__view;
            let from = -1;
            let to = -1;
            view.state.doc.descendants((n: any, p: number) => {
                if (n.isText && typeof n.text === 'string') {
                    if (from < 0 && n.text.includes(a)) from = p + n.text.indexOf(a);
                    if (n.text.includes(b)) to = p + n.text.indexOf(b) + b.length;
                }
                return true;
            });
            if (from < 0 || to < 0) throw new Error(`selectRange: テキストが見つからない: ${a} .. ${b}`);
            const TextSelection = view.state.selection.constructor;
            view.focus();
            view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)));
        }, [fromText, toText]);
        /* eslint-enable @typescript-eslint/no-explicit-any */
        await handle.page.waitForTimeout(120);
    }

    function assertTask(outline: string, checked: boolean, content: string): void {
        const expected = `list_item(checked=${checked})[paragraph["${content}"]]`;
        assert.ok(outline.includes(expected), `期待するチェックボックス項目が無い: ${expected}\n実際: ${outline}`);
    }

    // ───────────────────────────────────────────────────────────
    // A) チェックリストを書く日常フロー
    // ───────────────────────────────────────────────────────────
    describe('チェックリスト作成フロー', () => {
        it('買い物リストを一気に書き出す（チェックボックス + Enter の反復）と全項目が未チェックで並ぶ', async function () {
            if (!browser) { this.skip(); return; }
            h = await typeOnNewLine('Start\n\nTAIL\n', 'Start', '- [ ] 牛乳');
            await h.press('Enter');
            await h.type('パン');
            await h.press('Enter');
            await h.type('卵');
            await h.moveToEnd();

            const m = await h.model();
            assertTask(m.outline, false, '牛乳');
            assertTask(m.outline, false, 'パン');
            assertTask(m.outline, false, '卵');
            const md = await h.lastChangeMarkdown();
            assert.ok(md && md.includes('[ ] 牛乳') && md.includes('[ ] パン') && md.includes('[ ] 卵'),
                `保存される markdown にチェックボックスが揃っていない: ${md}`);
            assert.deepStrictEqual(h.errors, []);
        });

        it('普通の箇条書きの下にチェックボックスを続けると、同じリスト内に checked=null と checked=false が混在する', async function () {
            if (!browser) { this.skip(); return; }
            h = await openPreview(browser, '- 買い物メモ\n\nTAIL\n', '買い物メモ');
            await h.placeCursorAfterText('買い物メモ');
            await h.press('Enter');
            await h.type('[ ] 牛乳');
            await h.moveToEnd();

            const m = await h.model();
            assert.ok(m.outline.includes('list_item(checked=null)[paragraph["買い物メモ"]]'),
                `通常の箇条書き項目が壊れた: ${m.outline}`);
            assertTask(m.outline, false, '牛乳');
            assert.strictEqual((m.outline.match(/bullet_list/g) ?? []).length, 1,
                `混在リストが分裂した: ${m.outline}`);
            const md = await h.lastChangeMarkdown();
            assert.ok(md && md.includes('買い物メモ') && md.includes('[ ] 牛乳'),
                `混在リストの markdown が壊れた: ${md}`);
            assert.deepStrictEqual(h.errors, []);
        });

        it('会議メモの流れ（見出し → チェックリスト → 見出し → チェックリスト）を連続で作れる', async function () {
            if (!browser) { this.skip(); return; }
            h = await openPreview(browser, 'Start\n\nTAIL\n', 'Start');
            await h.placeCursorAfterText('Start');
            await h.press('Enter');
            await h.type('## 議題A');
            await h.press('Enter');
            await h.type('- [ ] 資料作成');
            await h.press('Enter');   // 新しい空のタスク項目
            await h.press('Enter');   // 空項目で Enter → リストを抜ける
            await h.type('## 議題B');
            await h.press('Enter');
            await h.type('- [ ] 会場予約');
            await h.moveToEnd();

            const m = await h.model();
            assert.ok(m.outline.includes('heading(2)["議題A"]'), `見出しAが壊れた: ${m.outline}`);
            assert.ok(m.outline.includes('heading(2)["議題B"]'), `見出しBが壊れた: ${m.outline}`);
            assertTask(m.outline, false, '資料作成');
            assertTask(m.outline, false, '会場予約');
            assert.deepStrictEqual(h.errors, []);
        });

        it('リストを抜けて2つ目のチェックボックスを素早く作っても、カーソルは2つ目の項目に残る', async function () {
            if (!browser) { this.skip(); return; }
            h = await typeOnNewLine('Start\n\nTAIL\n', 'Start', '- [ ] 一つ目');
            await h.press('Enter');   // 新しい空のタスク項目
            await h.press('Enter');   // リストを抜ける
            // 高速タイピング（変換ガードの 1000ms 時間窓内に 2 つ目の変換を起こす）
            await h.page.keyboard.type('- [ ] 二つ目', { delay: 20 });
            await h.page.waitForTimeout(500);

            const m = await h.model();
            assert.strictEqual(m.selParentText, '二つ目',
                `2つ目の変換後にカーソルが別ブロックへ飛んだ: selParentText="${m.selParentText}"`);
            await h.moveToEnd();
            const m2 = await h.model();
            assertTask(m2.outline, false, '一つ目');
            assertTask(m2.outline, false, '二つ目');
            assert.deepStrictEqual(h.errors, []);
        });

        it('文書の一番先頭（上に何も無い）でもチェックボックスを作れる', async function () {
            if (!browser) { this.skip(); return; }
            h = await openPreview(browser, '');
            await h.focusEditor();
            await h.type('- [ ] first');
            await h.moveToEnd();

            const m = await h.model();
            assertTask(m.outline, false, 'first');
            assert.deepStrictEqual(h.errors, []);
        });

        it('チェックボックス変換の直後に Cmd+Z すると、内容の Undo になる（カーソル復元だけで終わらない）', async function () {
            if (!browser) { this.skip(); return; }
            h = await typeOnNewLine('Start\n\nTAIL\n', 'Start', '- [ ] task');
            // ガードの時間窓（1000ms）が過ぎてから Undo する
            await h.page.waitForTimeout(1200);
            const before = (await h.model()).text;
            await h.press('Meta+z');

            const after = (await h.model()).text;
            assert.notStrictEqual(after, before,
                `Cmd+Z が文書内容を変えていない（カーソル復元だけが Undo された疑い）: ${JSON.stringify(after)}`);
            assert.deepStrictEqual(h.errors, []);
        });

        it('マーカーを打ちかけて別の文字を入力し、Backspace で戻ってから完成させてもチェックボックスになる', async function () {
            if (!browser) { this.skip(); return; }
            h = await openPreview(browser, 'Start\n\nTAIL\n', 'Start');
            await h.placeCursorAfterText('Start');
            await h.press('Enter');
            await h.type('- [x');    // 保留状態（タスクマーカーの途中）
            await h.type('ab');      // マーカーを諦めた入力 → ブロックが展開される
            await h.press('Backspace');
            await h.press('Backspace'); // '[x' まで戻る → 再び保留状態に戻るはず
            await h.type('] ');      // マーカー完成 → チェックボックス変換
            await h.type('done');
            await h.moveToEnd();

            const m = await h.model();
            assertTask(m.outline, true, 'done');
            assert.deepStrictEqual(h.errors, []);
        });

        it('チェックボックス入力後にフォーカスを外して戻っても、続きは同じ項目に入力される', async function () {
            if (!browser) { this.skip(); return; }
            h = await typeOnNewLine('Start\n\nTAIL\n', 'Start', '- [ ] 買い物');
            // タブ/ウィンドウ切り替えを模してフォーカスを外し、戻す
            await h.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
            await h.page.waitForTimeout(400);
            await h.focusEditor();
            await h.type('メモ');
            await h.moveToEnd();

            const m = await h.model();
            assertTask(m.outline, false, '買い物メモ');
            assert.deepStrictEqual(h.errors, []);
        });
    });

    // ───────────────────────────────────────────────────────────
    // B) 編集の基本的な往復（分割・結合・削除・Undo）
    // ───────────────────────────────────────────────────────────
    describe('編集の往復', () => {
        it('チェック済み/未チェックの行をまとめて選択削除 → Undo で checked 状態ごと復元される', async function () {
            if (!browser) { this.skip(); return; }
            h = await openPreview(browser, '- [ ] milk\n- [x] bread\n\nTAIL\n', 'bread');
            await selectRange(h, 'milk', 'bread');
            await h.press('Backspace');
            const deleted = await h.model();
            assert.ok(!deleted.text.includes('bread'), `選択削除が効いていない: ${deleted.text}`);

            await h.press('Meta+z');
            await h.moveToEnd();
            const m = await h.model();
            assertTask(m.outline, false, 'milk');
            assertTask(m.outline, true, 'bread');
            assert.deepStrictEqual(h.errors, []);
        });

        it('段落の途中で Enter して分割し、Backspace で結合すると元の段落に戻る', async function () {
            if (!browser) { this.skip(); return; }
            h = await openPreview(browser, 'こんにちは世界\n\nTAIL\n', 'こんにちは世界');
            await h.placeCursorAfterText('こんにちは');
            await h.press('Enter');
            const split = await h.model();
            assert.ok(split.outline.includes('paragraph["こんにちは"]') && split.outline.includes('paragraph["世界"]'),
                `段落が分割されていない: ${split.outline}`);

            await h.press('Backspace');
            await h.moveToEnd();
            const m = await h.model();
            assert.ok(m.outline.includes('paragraph["こんにちは世界"]'), `結合で元に戻らない: ${m.outline}`);
            assert.deepStrictEqual(h.errors, []);
        });

        it('見出しの末尾で Enter すると、次の行は本文（段落）になり見出しは汚れない', async function () {
            if (!browser) { this.skip(); return; }
            h = await openPreview(browser, '# タイトル\n\nTAIL\n', 'タイトル');
            await h.placeCursorAfterText('タイトル');
            await h.press('Enter');
            await h.type('本文');
            await h.moveToEnd();

            const m = await h.model();
            assert.ok(m.outline.includes('heading(1)["タイトル"]'), `見出しが汚れた: ${m.outline}`);
            assert.ok(m.outline.includes('paragraph["本文"]'), `本文が段落にならない: ${m.outline}`);
            assert.deepStrictEqual(h.errors, []);
        });

        it('箇条書き項目の途中で Enter すると項目が2つに分割される', async function () {
            if (!browser) { this.skip(); return; }
            h = await openPreview(browser, '- りんごバナナ\n\nTAIL\n', 'りんごバナナ');
            await h.placeCursorAfterText('りんご');
            await h.press('Enter');
            await h.moveToEnd();

            const m = await h.model();
            assert.ok(m.outline.includes('paragraph["りんご"]'), `分割前半が壊れた: ${m.outline}`);
            assert.ok(m.outline.includes('paragraph["バナナ"]'), `分割後半が壊れた: ${m.outline}`);
            assert.strictEqual((m.outline.match(/list_item/g) ?? []).length, 2,
                `項目が2つに分割されていない: ${m.outline}`);
            assert.deepStrictEqual(h.errors, []);
        });
    });

    // ───────────────────────────────────────────────────────────
    // C) テーブルでの誤用・境界操作
    // ───────────────────────────────────────────────────────────
    describe('テーブルでの境界操作', () => {
        it('テーブルセルの先頭でチェックボックス記法を打っても、ただの文字列として扱われテーブルは壊れない', async function () {
            if (!browser) { this.skip(); return; }
            h = await openPreview(browser, '| left | right |\n| --- | --- |\n| x | y |\n\nTAIL\n', 'left');
            await h.placeCursorAfterText('x');
            await h.press('Home');
            await h.type('[ ] task ');
            await h.moveToEnd();

            const m = await h.model();
            assert.ok(m.topTypes.includes('table'), `テーブルが消えた: ${m.topTypes.join(',')}`);
            assert.ok(!m.outline.includes('list_item'), `テーブルセル内でリスト化された: ${m.outline}`);
            assert.ok(m.text.includes('[ ] task'), `打った文字が失われた: ${m.text}`);
            assert.ok(m.text.includes('y'), `隣のセルが壊れた: ${m.text}`);
            assert.deepStrictEqual(h.errors, []);
        });
    });

    // ───────────────────────────────────────────────────────────
    // D) コピー & ペースト
    // ───────────────────────────────────────────────────────────
    describe('コピー & ペースト', () => {
        it('チェックボックス項目をコピーして別の場所にペーストすると、同じ内容の未チェック項目として挿入される', async function () {
            if (!browser) { this.skip(); return; }
            h = await typeOnNewLine('Start\n\nTAIL\n', 'Start', '- [ ] 元の項目');
            await h.moveToEnd();
            await h.pasteMarkdownText('- [ ] 貼り付けた項目');
            await h.moveToEnd();

            const m = await h.model();
            assertTask(m.outline, false, '元の項目');
            assertTask(m.outline, false, '貼り付けた項目');
            assert.deepStrictEqual(h.errors, []);
        });

        it('チェックボックスをペーストした直後に別の行で [ ] を追記しても、両方の項目が正しいまま残る', async function () {
            if (!browser) { this.skip(); return; }
            h = await openPreview(browser, '本文\n\nTAIL\n', '本文');
            await h.placeCursorAfterText('本文');
            await h.press('Enter');
            // ペースト直後は checkbox-selection-guard（1000ms）が有効な状態のまま、
            // 続けて別の行でタイプによるチェックボックス変換を起こす。
            await h.pasteMarkdownText('- [ ] 貼り付けた項目');
            await h.press('Enter');   // 新しい空のタスク項目
            await h.press('Enter');   // リストを抜ける
            await h.page.keyboard.type('- [ ] 追記した項目', { delay: 20 });
            await h.page.waitForTimeout(500);

            const m = await h.model();
            assert.strictEqual(m.selParentText, '追記した項目',
                `タイプ変換後にカーソルが別ブロックへ飛んだ: selParentText="${m.selParentText}"`);
            await h.moveToEnd();
            const m2 = await h.model();
            assertTask(m2.outline, false, '貼り付けた項目');
            assertTask(m2.outline, false, '追記した項目');
            assert.deepStrictEqual(h.errors, []);
        });
    });
});
