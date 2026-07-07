/**
 * 実ブラウザ回帰テスト: Mermaid 図（SVG）内テキストのマウスドラッグ選択・コピー。
 *
 * ユーザー報告「Mermaid図のテキストをコピーできるようにしてほしい」の調査で判明した
 * バグ: Mermaid 図は `Decoration.widget`（`mermaidDiagramPlugin.ts`）として描画されるが、
 * widget の spec に `ignoreSelection: true` を付けていなかったため、ProseMirror の
 * `WidgetViewDesc.ignoreMutation`（`type: "selection"` のミューテーションは
 * `widget.spec.ignoreSelection` が true の場合のみ無視する）がデフォルトの `false` を返し、
 * widget 内でのネイティブ選択（selectionchange）を ProseMirror が「無視すべきでない変更」と
 * みなして処理してしまい、結果としてドラッグ選択した内容が消えてしまっていた
 * （詳細: docs/specifications/mermaid-text-selection-fix.md）。
 *
 * 実行: `npm run test:browser`。ブラウザが無い環境では skip。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openPreview, type PreviewHandle } from '../previewBrowserHarness';

describe('実ブラウザ: Mermaid図内テキストの選択', function () {
    this.timeout(60000);
    let browser: Browser | null = null;
    let h: PreviewHandle | undefined;

    before(async () => { browser = await launchBrowser(); });
    after(async () => { await browser?.close(); });
    afterEach(async () => { if (h) { await h.close(); h = undefined; } });

    it('図のノードラベルをマウスドラッグで選択でき、getSelection() にテキストが残る', async function () {
        if (!browser) { this.skip(); return; }
        const md = ['```mermaid', 'graph TD', 'NodeAlpha-->NodeBeta'].join('\n') + '\n```\n';
        h = await openPreview(browser, md, undefined, { enableMermaid: true });
        await h.page.waitForFunction(() => !!document.querySelector('.mermaid-diagram svg foreignObject p'), undefined, { timeout: 10000 });
        await h.page.waitForTimeout(300);

        const rect = await h.page.evaluate(() => {
            const p = document.querySelector('.mermaid-diagram svg foreignObject p');
            if (!p) return null;
            const r = p.getBoundingClientRect();
            return { x: r.x, y: r.y, width: r.width, height: r.height };
        });
        assert.ok(rect, '図のラベル要素が見つからない');

        const startX = rect.x + 2;
        const startY = rect.y + rect.height / 2;
        const endX = rect.x + rect.width - 2;
        await h.page.mouse.move(startX, startY);
        await h.page.mouse.down();
        await h.page.mouse.move(endX, startY, { steps: 10 });
        await h.page.mouse.up();
        await h.page.waitForTimeout(200);

        const selectedText = await h.page.evaluate(() => window.getSelection()?.toString() ?? '');
        assert.ok(selectedText.length > 0, `図内テキストがドラッグ選択できない: ${JSON.stringify(selectedText)}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('図の選択中もコードブロックの編集（打鍵）は通常どおり効く', async function () {
        if (!browser) { this.skip(); return; }
        const md = ['```mermaid', 'graph TD', 'NodeAlpha-->NodeBeta'].join('\n') + '\n```\n\n段落\n';
        h = await openPreview(browser, md, '段落', { enableMermaid: true });
        await h.page.waitForFunction(() => !!document.querySelector('.mermaid-diagram svg foreignObject p'), undefined, { timeout: 10000 });
        await h.page.waitForTimeout(300);

        await h.placeCursorAfterText('NodeBeta');
        await h.type('X');
        const m = await h.model();
        assert.ok(m.text.includes('NodeBetaX'), `図の選択機能追加後もソース編集が効く: ${m.text}`);
        assert.deepStrictEqual(h.errors, []);
    });
});
