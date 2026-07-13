/**
 * 実ブラウザ回帰テスト: Preview 上の Mermaid 図を「見たまま」編集する。
 *
 * Mermaid の標準構文にはノードの座標（レイアウト）を保存する仕組みが無く、レイアウトは
 * 常に Mermaid が自動計算するため、「図をドラッグして自由配置する」編集はソースへ
 * 反映しようがない。そのため対応範囲を「ノードラベルのダブルクリック編集」に絞る:
 * SVG 上のノードをダブルクリックするとインライン入力欄が現れ、確定すると
 * ソースの ```mermaid コードブロック中の対応ノードのラベル文字列だけが書き換わり、
 * 図も新しいラベルで再描画される。純粋な文字列置換ロジックは
 * `src/preview/webview/mermaidNodeLabelEdit.ts`（`updateMermaidNodeLabel`）が担う。
 *
 * 実行: `npm run test:browser`。ブラウザが無い環境では skip。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openPreview, type PreviewHandle } from '../previewBrowserHarness';

describe('実ブラウザ: Preview の Mermaid ノードラベルのダブルクリック編集', function () {
    this.timeout(120000);

    let browser: Browser | null = null;
    let h: PreviewHandle | undefined;

    before(async () => { browser = await launchBrowser(); });
    after(async function () { this.timeout(20000); await browser?.close(); });
    afterEach(async () => { if (h) { await h.close(); h = undefined; } });

    it('図のノードをダブルクリックすると、現在のラベルが入った入力欄が開く', async function () {
        if (!browser) { this.skip(); return; }
        const md = '```mermaid\ngraph TD;\nA[Start]-->B;\n```\n';
        h = await openPreview(browser, md, undefined, { enableMermaid: true });
        await h.page.waitForTimeout(500);

        await h.page.locator('.mermaid-diagram .node').first().dblclick();
        const input = h.page.locator('.mermaid-node-label-editor');
        await input.waitFor({ state: 'visible', timeout: 2000 });
        assert.strictEqual(await input.inputValue(), 'Start');
        assert.deepStrictEqual(h.errors, []);
    });

    it('編集開始後にもう一度ダブルクリックしても編集欄は1つで図は崩れない', async function () {
        if (!browser) { this.skip(); return; }
        const md = '```mermaid\ngraph TD;\nA[Start]-->B;\n```\n';
        h = await openPreview(browser, md, undefined, { enableMermaid: true });
        await h.page.waitForTimeout(500);

        const node = h.page.locator('.mermaid-diagram .node').first();
        await node.dblclick();
        await node.dblclick();
        await h.page.waitForTimeout(100);

        assert.strictEqual(await h.page.locator('.mermaid-node-label-editor').count(), 1);
        assert.strictEqual(await h.page.locator('.mermaid-diagram svg').count(), 1, '図が再描画競合で消えてはいけない');
        assert.deepStrictEqual(h.errors, []);
    });

    it('ラベルを書き換えて Enter で確定すると、ソースへ反映され図も新しいラベルで再描画される', async function () {
        if (!browser) { this.skip(); return; }
        const md = '```mermaid\ngraph TD;\nA[Start]-->B;\n```\n';
        h = await openPreview(browser, md, undefined, { enableMermaid: true });
        await h.page.waitForTimeout(500);

        await h.page.locator('.mermaid-diagram .node').first().dblclick();
        const input = h.page.locator('.mermaid-node-label-editor');
        await input.waitFor({ state: 'visible', timeout: 2000 });
        await input.fill('');
        await input.type('Begin', { delay: 30 });
        await input.press('Enter');
        await h.page.waitForTimeout(400);

        const text = (await h.model()).text;
        assert.ok(text.includes('A[Begin]-->B;'), `ソースにラベル変更が反映されていない: ${JSON.stringify(text)}`);
        assert.ok(!text.includes('Start'), `古いラベルが残っている: ${JSON.stringify(text)}`);

        const svgLabel = await h.page.locator('.mermaid-diagram .node .nodeLabel').first().innerText();
        assert.strictEqual(svgLabel, 'Begin');

        assert.strictEqual(await input.count(), 0, '確定後も入力欄が残っている');
        assert.deepStrictEqual(h.errors, []);
    });

    it('Escape でキャンセルすると、ソースも図も変更されない', async function () {
        if (!browser) { this.skip(); return; }
        const md = '```mermaid\ngraph TD;\nA[Start]-->B;\n```\n';
        h = await openPreview(browser, md, undefined, { enableMermaid: true });
        await h.page.waitForTimeout(500);

        await h.page.locator('.mermaid-diagram .node').first().dblclick();
        const input = h.page.locator('.mermaid-node-label-editor');
        await input.waitFor({ state: 'visible', timeout: 2000 });
        await input.fill('');
        await input.type('Changed', { delay: 30 });
        await input.press('Escape');
        await h.page.waitForTimeout(300);

        assert.strictEqual(await input.count(), 0, 'Escape 後も入力欄が残っている');
        const text = (await h.model()).text;
        assert.ok(text.includes('A[Start]-->B;'), `Escape なのにソースが変更された: ${JSON.stringify(text)}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('ラベルの無いベアノード（ID がそのままラベル）も編集して角括弧ラベルを付与できる', async function () {
        if (!browser) { this.skip(); return; }
        const md = '```mermaid\ngraph TD;\nA-->B;\n```\n';
        h = await openPreview(browser, md, undefined, { enableMermaid: true });
        await h.page.waitForTimeout(500);

        await h.page.locator('.mermaid-diagram .node').first().dblclick();
        const input = h.page.locator('.mermaid-node-label-editor');
        await input.waitFor({ state: 'visible', timeout: 2000 });
        assert.strictEqual(await input.inputValue(), 'A');
        await input.fill('');
        await input.type('Start', { delay: 30 });
        await input.press('Enter');
        await h.page.waitForTimeout(400);

        const text = (await h.model()).text;
        assert.ok(text.includes('A[Start]-->B;'), `ソースにラベル付与が反映されていない: ${JSON.stringify(text)}`);
        assert.deepStrictEqual(h.errors, []);
    });
});
