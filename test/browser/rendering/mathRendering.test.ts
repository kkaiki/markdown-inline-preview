/**
 * 実ブラウザ・仕様カバレッジテスト: 数式（KaTeX）レンダリング。
 *
 * preview-features.md「リッチコンテンツ」の数式サポート（`enableMath`）が
 * 実 Chromium で本当に描画されることを検証する（spec-test-coverage.md ギャップ 1）。
 *
 * 数式は `katex/contrib/auto-render` が Milkdown（ProseMirror）管理下の DOM を
 * 直接書き換える方式のため、Mermaid で起きた「セレクタ不一致で一度も描画されない」
 * 「ProseMirror の mutation observer に巻き戻される」系の退行が起きやすい。
 * DOM に `.katex` が実在すること、編集後も保存 markdown に KaTeX の HTML が
 * 混入しないこと（数式ソースが保たれること）まで確認する。
 *
 * 実行: `npm run test:browser`。ブラウザが無い環境では skip。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openPreview, DEFAULT_SETTINGS, type PreviewHandle } from '../previewBrowserHarness';

/** ホストから 'settings' 更新メッセージを送る（`enableMath` 等の動的切り替え再現用）。 */
async function pushSettings(h: PreviewHandle, override: Partial<typeof DEFAULT_SETTINGS>): Promise<void> {
    await h.page.evaluate(
        (settings) => window.postMessage({ type: 'settings', settings }, '*'),
        { ...DEFAULT_SETTINGS, ...override }
    );
    await h.page.waitForTimeout(200);
}

describe('実ブラウザ: 数式（KaTeX）レンダリング', function () {
    this.timeout(120000);

    let browser: Browser | null = null;
    let h: PreviewHandle | undefined;

    before(async () => { browser = await launchBrowser(); });
    after(async function () { this.timeout(20000); await browser?.close(); });
    afterEach(async () => { if (h) { await h.close(); h = undefined; } });

    it('enableMath: true でインライン数式 $E=mc^2$ が KaTeX で描画される', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '質量とエネルギー: $E=mc^2$ の関係\n\nTAIL\n', 'TAIL', { enableMath: true });
        await h.page.waitForTimeout(600);

        const katexCount = await h.page.locator('#milkdown-root .katex').count();
        assert.ok(katexCount > 0, 'インライン数式が KaTeX 要素として描画されていない（.katex が 0 個）');
        assert.deepStrictEqual(h.errors, []);
    });

    it('enableMath: true でブロック数式 $$...$$ が描画される', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '前文\n\n$$\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}$$\n\nTAIL\n', 'TAIL', { enableMath: true });
        await h.page.waitForTimeout(600);

        const katexCount = await h.page.locator('#milkdown-root .katex').count();
        assert.ok(katexCount > 0, 'ブロック数式が KaTeX 要素として描画されていない（.katex が 0 個）');
        assert.deepStrictEqual(h.errors, []);
    });

    it('enableMath: false なら数式は描画されず、$ 記法がそのまま見える', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '数式: $E=mc^2$ です\n\nTAIL\n', 'TAIL', { enableMath: false });
        await h.page.waitForTimeout(400);

        const katexCount = await h.page.locator('#milkdown-root .katex').count();
        assert.strictEqual(katexCount, 0, 'enableMath: false なのに KaTeX 描画された');
        const m = await h.model();
        assert.ok(m.text.includes('$E=mc^2$'), `$ 記法のソースが失われた: ${m.text}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('数式が描画された後に別の場所を編集しても、保存 markdown には数式ソースが保たれ KaTeX の HTML が混入しない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '数式: $E=mc^2$ です\n\nTAIL\n', 'TAIL', { enableMath: true });
        await h.page.waitForTimeout(600);

        await h.placeCursorAfterText('TAIL');
        await h.type(' 追記');
        await h.page.waitForTimeout(400);

        const md = await h.lastChangeMarkdown();
        assert.ok(md !== null, '編集したのに change が送信されていない');
        assert.ok(md.includes('$E=mc^2$'), `数式ソースが保存 markdown から失われた: ${md}`);
        assert.ok(!md.includes('katex') && !md.includes('<span'), `KaTeX の HTML が markdown に混入した: ${md}`);
        assert.ok(md.includes('追記'), `追記した本文が保存されていない: ${md}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('数式を含む行そのものを編集しても文書が壊れない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '数式: $E=mc^2$ です\n\nTAIL\n', 'TAIL', { enableMath: true });
        await h.page.waitForTimeout(600);

        await h.placeCursorAfterText('です');
        await h.type('ね');
        await h.page.waitForTimeout(400);

        const m = await h.model();
        assert.ok(m.text.includes('ですね'), `数式行への追記が反映されない: ${m.text}`);
        assert.ok(m.text.includes('E=mc^2') || m.text.includes('$E=mc^2$'), `数式ソースがモデルから消えた: ${m.text}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('インラインコード内の $...$ は数式化されず、コードとしてそのまま表示される', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, 'コード: `$notmath$` です\n\nTAIL\n', 'TAIL', { enableMath: true });
        await h.page.waitForTimeout(600);

        const katexCount = await h.page.locator('#milkdown-root .katex').count();
        assert.strictEqual(katexCount, 0, 'インラインコード内の $ が数式として描画された');
        const m = await h.model();
        assert.ok(m.text.includes('$notmath$'), `インラインコードのソースが失われた: ${m.text}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('コードブロック内の $...$ は数式化されず、コードとしてそのまま表示される', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '```\n$notmath$\n```\n\nTAIL\n', 'TAIL', { enableMath: true });
        await h.page.waitForTimeout(600);

        const katexCount = await h.page.locator('#milkdown-root .katex').count();
        assert.strictEqual(katexCount, 0, 'コードブロック内の $ が数式として描画された');
        const m = await h.model();
        assert.ok(m.text.includes('$notmath$'), `コードブロックのソースが失われた: ${m.text}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('ハードブレイクを挟んで $$ が分割される（複数行にまたがる）場合は数式として描画されず、ソースのまま残る', async function () {
        if (!browser) { this.skip(); return; }
        // "  \n"（行末2スペース+改行）で hardbreak を作る。$$ 開始側と終了側が別のテキストノードに
        // 分かれるため、mathDecorationPlugin はテキストノード単位でしか正規表現を評価できず、
        // このケースは数式として認識されない（既知の制約。破損せずソースが残ることだけを保証する）。
        h = await openPreview(browser, '$$a+b  \nc+d$$\n\nTAIL\n', 'TAIL', { enableMath: true });
        await h.page.waitForTimeout(600);

        const katexCount = await h.page.locator('#milkdown-root .katex').count();
        assert.strictEqual(katexCount, 0, 'hardbreak をまたぐ $$ が誤って数式化された');
        const m = await h.model();
        assert.ok(m.text.includes('a+b') && m.text.includes('c+d$$'), `ソーステキストが壊れた: ${m.text}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('enableMath を設定メッセージで true → false → true と動的に切り替えると、都度すぐに反映される', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '数式: $E=mc^2$ です\n\nTAIL\n', 'TAIL', { enableMath: false });
        await h.page.waitForTimeout(400);
        assert.strictEqual(await h.page.locator('#milkdown-root .katex').count(), 0,
            '初期状態（enableMath: false）で数式が描画されている');

        await pushSettings(h, { enableMath: true });
        assert.ok(await h.page.locator('#milkdown-root .katex').count() > 0,
            'enableMath: true への切り替え直後に数式が描画されない');

        await pushSettings(h, { enableMath: false });
        assert.strictEqual(await h.page.locator('#milkdown-root .katex').count(), 0,
            'enableMath: false への切り替え直後に数式のレンダリングが消えない');

        await pushSettings(h, { enableMath: true });
        assert.ok(await h.page.locator('#milkdown-root .katex').count() > 0,
            '再度 enableMath: true にしても数式が復活しない');
        assert.deepStrictEqual(h.errors, []);
    });
});
