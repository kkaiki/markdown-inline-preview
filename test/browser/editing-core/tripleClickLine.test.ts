/**
 * 実ブラウザ回帰テスト: トリプルクリックは「クリックした1行」だけを選択する。
 *
 * この Preview では Enter が段落内の改行（hardbreak）になるため、見た目で何行にも
 * わたる文章が **1つの paragraph ノード** になっている。ProseMirror 既定の
 * トリプルクリックはテキストブロック全体を選ぶので、段落全体（＝画面上の十数行）が
 * まとめて選択されてしまい「3回クリックすると全部選ばれる」状態だった
 * （2026-07-27 ユーザー報告）。hardbreak を行境界として扱い、1行だけを選ぶ。
 *
 * コードブロック内は元から1行だけを選ぶ実装があり（`codeBlockLines.ts`）、その回帰も見る。
 *
 * 実行: `npm run test:browser`。ブラウザが無い環境では skip。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openPreview, type PreviewHandle } from '../previewBrowserHarness';

/** 指定テキストの位置を実マウスでトリプルクリックし、選択されたテキストを返す。 */
async function tripleClickAt(h: PreviewHandle, text: string): Promise<string> {
    const point = await h.page.evaluate((t: string) => {
        const root = document.querySelector('.milkdown') || document.body;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        let node: Node | null;
        while ((node = walker.nextNode())) {
            const idx = (node.textContent || '').indexOf(t);
            if (idx < 0) continue;
            const range = document.createRange();
            range.setStart(node, idx);
            range.setEnd(node, idx + t.length);
            const rect = range.getClientRects()[0] || range.getBoundingClientRect();
            return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        }
        return null;
    }, text);
    assert.ok(point, `テキストが見つからない: ${text}`);
    await h.page.mouse.click(point.x, point.y, { clickCount: 3 });
    await h.page.waitForTimeout(150);
    return h.page.evaluate(() => {
        /* eslint-disable @typescript-eslint/no-explicit-any */
        const view = (window as any).__view;
        const { from, to } = view.state.selection;
        return view.state.doc.textBetween(from, to, '\n', '\n');
        /* eslint-enable @typescript-eslint/no-explicit-any */
    });
}

describe('実ブラウザ: トリプルクリックで1行だけ選択する', function () {
    this.timeout(120000);

    let browser: Browser | null = null;
    let h: PreviewHandle | undefined;

    before(async () => { browser = await launchBrowser(); });
    after(async () => { await browser?.close(); });
    afterEach(async () => { if (h) { await h.close(); h = undefined; } });

    // 単一改行（hardbreak）で3行がひとつの段落になっているソース。
    const MULTILINE = '一行目のテキスト\n二行目のテキスト\n三行目のテキスト\n\n別の段落\n';

    it('段落内の真ん中の行をトリプルクリックすると、その行だけが選択される', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, MULTILINE, '別の段落');
        const selected = await tripleClickAt(h, '二行目のテキスト');
        assert.strictEqual(
            selected,
            '二行目のテキスト',
            `1行だけでなく段落全体が選択されている: ${JSON.stringify(selected)}`
        );
        assert.deepStrictEqual(h.errors, []);
    });

    it('段落の最初の行をトリプルクリックしても、その行だけが選択される', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, MULTILINE, '別の段落');
        const selected = await tripleClickAt(h, '一行目のテキスト');
        assert.strictEqual(selected, '一行目のテキスト', `選択範囲が広すぎる: ${JSON.stringify(selected)}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('段落の最後の行をトリプルクリックしても、その行だけが選択される', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, MULTILINE, '別の段落');
        const selected = await tripleClickAt(h, '三行目のテキスト');
        assert.strictEqual(selected, '三行目のテキスト', `選択範囲が広すぎる: ${JSON.stringify(selected)}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('1行だけの段落では、その段落のテキストが選択される（従来どおり）', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, MULTILINE, '別の段落');
        const selected = await tripleClickAt(h, '別の段落');
        assert.strictEqual(selected, '別の段落', `選択範囲が想定外: ${JSON.stringify(selected)}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('コードブロック内のトリプルクリックも1行だけ（回帰防止）', async function () {
        if (!browser) { this.skip(); return; }
        // hljs がコードを複数の span に分割するため、テキストノードをまたがない
        // 1語の行を使う（テスト用ヘルパーは単一テキストノード内を探すため）。
        h = await openPreview(browser, '```\nalpha\nbravo\n```\n\n段落\n', '段落');
        const selected = await tripleClickAt(h, 'bravo');
        assert.strictEqual(selected, 'bravo', `コードブロック全体が選択された: ${JSON.stringify(selected)}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('リスト項目のトリプルクリックはその項目のテキストだけ', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '- 項目A\n- 項目B\n- 項目C\n\n段落\n', '段落');
        const selected = await tripleClickAt(h, '項目B');
        assert.strictEqual(selected, '項目B', `リスト全体が選択された: ${JSON.stringify(selected)}`);
        assert.deepStrictEqual(h.errors, []);
    });
});
