/**
 * 実ブラウザ回帰テスト: 3 つ以上の異なるブロック（見出し・チェックボックス・blockquote）を
 * 連続でフォーカス移動したときの blockPrefixEditPlugin の expand/collapse チェーン。
 *
 * 既存の `focus-expand/blockPrefixBugs.test.ts` は「見出し ⇄ 段落」の 2 ブロック往復のみを
 * 検証しており、test-directory-design.md §5 が挙げる「複数ブロックの展開が絡む編集中の
 * 位置移動」は未カバーだった。ここでは異なる種別のブロックを 3 つ連鎖的に移動し、
 * 前のブロックの collapse（プレフィックス削除・属性同期）が完了する前に次のブロックの
 * expand が始まっても、いずれのブロックも記法が汚れず・カーソルが正しいブロックに残ることを
 * 検証する。
 *
 * 実行: `npm run test:browser`。ブラウザが無い環境では skip。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openPreview, type PreviewHandle } from '../previewBrowserHarness';

describe('実ブラウザ: 複数ブロックをまたぐ expand/collapse チェーン', function () {
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

    it('見出し→チェックボックス→blockquote→見出し の連鎖移動で、どのブロックも記法が汚れない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(
            browser,
            '## 見出しA\n\n- [ ] タスクB\n\n> 引用C\n\n## 見出しD\n\nTAIL\n',
            'TAIL'
        );

        // 4 ブロックを連続でフォーカス移動する（各移動間の待機は最小限にし、
        // 前のブロックの collapse が完全に落ち着く前に次の expand が走る状況に近づける）。
        await h.placeCursorAfterText('見出しA');
        await h.placeCursorAfterText('タスクB');
        await h.placeCursorAfterText('引用C');
        await h.placeCursorAfterText('見出しD');
        // 最後に離脱して全ブロックを collapse させる。
        await h.placeCursorAfterText('TAIL');

        const m = await h.model();
        assert.ok(m.outline.includes('heading(2)["見出しA"]'),
            `見出しAの記法が壊れた: ${m.outline}`);
        assert.ok(m.outline.includes('list_item(checked=false)[paragraph["タスクB"]]'),
            `チェックボックスBの記法が壊れた: ${m.outline}`);
        assert.ok(m.outline.includes('blockquote'),
            `blockquoteCが壊れた: ${m.outline}`);
        assert.ok(m.text.includes('引用C'),
            `blockquoteCのテキストが失われた: ${m.text}`);
        assert.ok(m.outline.includes('heading(2)["見出しD"]'),
            `見出しDの記法が壊れた: ${m.outline}`);
        // いずれのブロックにも生の記法プレフィックスが残っていないこと。
        assert.ok(!m.text.includes('## ##'), `見出しプレフィックスが累積した: ${m.text}`);
        assert.ok(!m.text.includes('- - '), `リストプレフィックスが累積した: ${m.text}`);
        assert.ok(!m.text.includes('> > '), `blockquoteプレフィックスが累積した: ${m.text}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('見出し→チェックボックス→blockquote を1往復した後、もう一往復しても記法が累積しない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(
            browser,
            '## 見出しA\n\n- [ ] タスクB\n\n> 引用C\n\nTAIL\n',
            'TAIL'
        );

        for (let i = 0; i < 2; i++) {
            await h.placeCursorAfterText('見出しA');
            await h.placeCursorAfterText('タスクB');
            await h.placeCursorAfterText('引用C');
            await h.placeCursorAfterText('TAIL');
        }

        const m = await h.model();
        assert.ok(m.outline.includes('heading(2)["見出しA"]'),
            `2往復後に見出しAの記法が壊れた: ${m.outline}`);
        assert.ok(m.outline.includes('list_item(checked=false)[paragraph["タスクB"]]'),
            `2往復後にチェックボックスBの記法が壊れた: ${m.outline}`);
        assert.ok(m.text.includes('引用C'),
            `2往復後にblockquoteCのテキストが失われた: ${m.text}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('連鎖移動の最後にカーソルを置いたブロックへ正しくカーソルが残る', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(
            browser,
            '## 見出しA\n\n- [ ] タスクB\n\n> 引用C\n\nTAIL\n',
            'TAIL'
        );

        await h.placeCursorAfterText('見出しA');
        await h.placeCursorAfterText('タスクB');
        await h.placeCursorAfterText('引用C');

        const m = await h.model();
        // 引用Cはまだフォーカスが抜けていない（collapse 前）ため、展開中のプレフィックス
        // "> " が実テキストとして残ったままなのが正しい状態。
        // ブラウザの contenteditable がスペースを non-breaking space（ ）として
        // 反映することがある（blockPrefixEditPlugin.ts 冒頭のコメント参照）ため、
        // 比較前に正規化する。
        const normalized = m.selParentText.replace(/ /g, ' ');
        assert.strictEqual(normalized, '> 引用C',
            `連鎖移動後にカーソルが最後のブロック以外へ残った: selParentText=${JSON.stringify(m.selParentText)}`);
        assert.deepStrictEqual(h.errors, []);
    });
});
