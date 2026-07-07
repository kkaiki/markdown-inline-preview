/**
 * 実ブラウザ回帰テスト: Preview モードでの Mermaid 図の描画。
 *
 * バグ1: ```mermaid コードブロックが図として描画されない。
 * milkdown の code_block ノードは `<pre data-language="mermaid"><code>...</code></pre>`
 * という DOM を生成する（`data-language` は `<pre>` 側の属性で、`<code>` に
 * `language-mermaid` のような class は一切付かない）。旧実装は
 * `pre code.language-mermaid` というセレクタでコードブロックを探しており、
 * これは絶対にヒットしないため mermaid.render が呼ばれなかった。
 *
 * バグ2: セレクタを直しても、`pre.replaceWith(container)` で ProseMirror が
 * 管理する contentDOM を直接書き換えると、MutationObserver が「自分が作って
 * いない変更」とみなして再パースし、コードブロックが壊れてしまう
 * （`codeHighlightPlugin.ts` のコメントにある教訓と同じ問題）。
 *
 * 修正: `mermaidDiagramPlugin.ts` で ProseMirror デコレーション（`Decoration.widget`）
 * としてコードブロックの**直後**に図を挿入する方式にした。ソースの `<pre><code>` は
 * そのまま残る（引き続き編集できる）ので、ソースの下に図が並んで表示される。
 *
 * 実行: `npm run test:browser`。ブラウザが無い環境では skip。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openPreview, type PreviewHandle } from '../previewBrowserHarness';

describe('実ブラウザ: Preview の Mermaid 図描画', function () {
    this.timeout(120000);

    let browser: Browser | null = null;
    let h: PreviewHandle | undefined;

    before(async () => { browser = await launchBrowser(); });
    after(async function () { this.timeout(20000); await browser?.close(); });
    afterEach(async () => { if (h) { await h.close(); h = undefined; } });

    it('```mermaid コードブロックの下に SVG 図が描画される（ソースは編集可能なまま残る）', async function () {
        if (!browser) { this.skip(); return; }
        const md = '```mermaid\ngraph TD;\nA-->B;\n```\n';
        h = await openPreview(browser, md, undefined, { enableMermaid: true });
        // 描画には mermaid.render の非同期処理が挟まるので少し待つ。
        await h.page.waitForTimeout(500);

        const diagramCount = await h.page.locator('.mermaid-diagram svg').count();
        assert.ok(diagramCount > 0, 'mermaid の SVG 図が描画されていない（.mermaid-diagram svg が見つからない）');

        // ソースの code_block は消えず、そのまま編集可能に残る。
        const rawCodeBlockCount = await h.page.locator('pre[data-language="mermaid"]').count();
        assert.strictEqual(rawCodeBlockCount, 1, 'mermaid コードブロックのソースが消えてしまっている');

        assert.deepStrictEqual(h.errors, []);
    });

    it('enableMermaid が false のときは図を描画しない', async function () {
        if (!browser) { this.skip(); return; }
        const md = '```mermaid\ngraph TD;\nA-->B;\n```\n';
        h = await openPreview(browser, md, undefined, { enableMermaid: false });
        await h.page.waitForTimeout(500);

        const diagramCount = await h.page.locator('.mermaid-diagram').count();
        assert.strictEqual(diagramCount, 0, 'enableMermaid=false なのに図が描画されている');
        assert.deepStrictEqual(h.errors, []);
    });
});
