/**
 * 実ブラウザ回帰テスト: `- [ ] タスク` を1文字ずつ実際にタイプしてもチェックボックスの
 * 見た目にならない不具合。
 *
 * ## バグ内容（2つ、独立して発生する）
 *
 * 1. `- ` を打つと段落が `bullet_list > list_item`（中身は空）へ変換されるが、
 *    `blockPrefixEditPlugin`（Typora 風フォーカス展開）が即座に `- ` を実テキストとして
 *    展開してしまう。続けて `[ ] ` をタイプしても、GFM の `wrapInTaskListInputRule`
 *    （`^\[ \]\s$` にマッチする必要がある）が段落先頭の `^` にマッチできず、
 *    チェックボックスへ変換されない。
 * 2. 1 を塞いだ後も、`checked: null → boolean` の変換が Milkdown の `list-item-block`
 *    Web Component を再マウントさせ、ブラウザのネイティブ selection を見失わせる。
 *    直後に届く selectionchange 由来の transaction でカーソルが別ブロック（多くの場合
 *    見出しなど）へ飛び、続けてタイプした文字がそちらに書き込まれてしまう。
 *
 * 詳細設計: docs/specifications/typed-checkbox-conversion-fix.md
 *
 * 既存のマークダウンを読み込んだ場合（初期ロード）は問題無い。実際にキーを1つずつ
 * 押して作る場合にだけ再現するため、`h.type()`（実キーイベント）で検証する。
 *
 * 実行: `npm run test:browser`。ブラウザが無い環境では skip。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openPreview, type PreviewHandle } from '../previewBrowserHarness';

describe('実ブラウザ: タイプによるチェックボックス変換の回帰', function () {
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

    /** 対象行にカーソルを合わせ、Enter で新しい行を作ってから typed を1文字ずつタイプする。 */
    async function typeOnNewLine(markdown: string, target: string, typed: string): Promise<PreviewHandle> {
        const handle = await openPreview(browser, markdown, target);
        await handle.placeCursorAfterText(target);
        await handle.press('Enter');
        await handle.page.waitForTimeout(150);
        await handle.type(typed);
        await handle.page.waitForTimeout(300);
        return handle;
    }

    function assertCheckbox(m: { outline: string }, checked: boolean, content: string): void {
        const expected = `list_item(checked=${checked})[paragraph["${content}"]]`;
        assert.ok(
            m.outline.includes(expected),
            `チェックボックスに変換されていない: ${m.outline}（期待: ${expected} を含む）`
        );
    }

    it('"- [ ] task" を1文字ずつタイプするとチェックボックスになる', async function () {
        if (!browser) { this.skip(); return; }
        h = await typeOnNewLine('Start\n\nTAIL\n', 'Start', '- [ ] task');
        assertCheckbox(await h.model(), false, 'task');
        assert.deepStrictEqual(h.errors, []);
    });

    it('"* [ ] task"（アスタリスクマーカー）でもチェックボックスになる', async function () {
        if (!browser) { this.skip(); return; }
        h = await typeOnNewLine('Start\n\nTAIL\n', 'Start', '* [ ] task');
        assertCheckbox(await h.model(), false, 'task');
        assert.deepStrictEqual(h.errors, []);
    });

    it('"+ [ ] task"（プラスマーカー）でもチェックボックスになる', async function () {
        if (!browser) { this.skip(); return; }
        h = await typeOnNewLine('Start\n\nTAIL\n', 'Start', '+ [ ] task');
        assertCheckbox(await h.model(), false, 'task');
        assert.deepStrictEqual(h.errors, []);
    });

    it('"- [x] task"（最初からチェック済み）は checked=true になる', async function () {
        if (!browser) { this.skip(); return; }
        h = await typeOnNewLine('Start\n\nTAIL\n', 'Start', '- [x] task');
        assertCheckbox(await h.model(), true, 'task');
        assert.deepStrictEqual(h.errors, []);
    });

    it('"1. [ ] task"（番号付きリスト内）でもチェックボックスになる', async function () {
        if (!browser) { this.skip(); return; }
        h = await typeOnNewLine('Start\n\nTAIL\n', 'Start', '1. [ ] task');
        assertCheckbox(await h.model(), false, 'task');
        assert.deepStrictEqual(h.errors, []);
    });

    it('日本語本文（"- [ ] 買い物"）でもチェックボックスになる', async function () {
        if (!browser) { this.skip(); return; }
        h = await typeOnNewLine('Start\n\nTAIL\n', 'Start', '- [ ] 買い物');
        assertCheckbox(await h.model(), false, '買い物');
        assert.deepStrictEqual(h.errors, []);
    });

    it('上に既存の箇条書きがあっても、タイプしたチェックボックスは独立して変換される', async function () {
        if (!browser) { this.skip(); return; }
        h = await typeOnNewLine('- 既存項目\n\nStart\n\nTAIL\n', 'Start', '- [ ] task');
        assertCheckbox(await h.model(), false, 'task');
        assert.deepStrictEqual(h.errors, []);
    });

    it('見出しの直後でタイプしても、見出しへ文字が誤って書き込まれない（原因B）', async function () {
        if (!browser) { this.skip(); return; }
        h = await typeOnNewLine('## 見出し\n\nTAIL\n', '見出し', '- [ ] task');
        const m = await h.model();
        assert.ok(
            m.outline.includes('heading(2)["見出し"]'),
            `見出しに文字が誤って書き込まれた: ${m.outline}`
        );
        assertCheckbox(m, false, 'task');
        assert.deepStrictEqual(h.errors, []);
    });

    it('回帰確認: 通常の箇条書き（チェックボックスでない）は今まで通りフォーカス中に "- " が展開される', async function () {
        if (!browser) { this.skip(); return; }
        h = await typeOnNewLine('Start\n\nTAIL\n', 'Start', '- 普通のアイテム');
        const m = await h.model();
        assert.ok(
            m.outline.includes('list_item(checked=null)[paragraph["- 普通のアイテム"]]'),
            `フォーカス中の "- " プレフィックス展開が退行した: ${m.outline}`
        );
        assert.deepStrictEqual(h.errors, []);
    });
});
