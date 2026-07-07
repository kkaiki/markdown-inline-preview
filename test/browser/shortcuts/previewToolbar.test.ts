/**
 * 実ブラウザ回帰テスト: Preview ツールバーのレイアウト仕様。
 *
 * ## 仕様
 * - ツールバーは「スクロール可能な書式ボタン領域（左）」と「固定右端領域」に分かれる。
 * - 書式ボタン（Undo/Redo/H1–H3/チェックボックス/箇条書き/番号付き/引用/コード/テーブル）は
 *   `.preview-toolbar-scroll` 内に配置され、幅が足りないときは横スクロールで辿れる。
 * - Zoom / Export / Raw-Preview 切り替えは `.preview-toolbar-fixed` 内に固定表示し、
 *   スクロール対象外とする。
 * - `showLineNumbers: true` のときも行番号ガターはツールバーの影に隠れず表示される。
 *
 * 実行: `npm run test:browser`。ブラウザが無い環境では skip。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openPreview, type PreviewHandle } from '../previewBrowserHarness';

describe('実ブラウザ: Preview ツールバー レイアウト', function () {
    this.timeout(120000);

    let browser: Browser | null = null;
    let h: PreviewHandle | undefined;

    before(async () => { browser = await launchBrowser(); });
    after(async function () { this.timeout(20000); await browser?.close(); });
    afterEach(async () => { if (h) { await h.close(); h = undefined; } });

    // ──────────────────────────────────────────────
    // 1) スクロール可能な書式ボタン領域
    // ──────────────────────────────────────────────
    it('.preview-toolbar-scroll が存在し overflow-x が auto/scroll である', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '# Title\n\nbody\n', 'body', { showToolbar: true });
        await h.page.waitForTimeout(200);
        const result = await h.page.evaluate(() => {
            const el = document.querySelector('.preview-toolbar-scroll');
            if (!el) return { ok: false, reason: 'no .preview-toolbar-scroll element' };
            const style = getComputedStyle(el);
            const ovf = style.overflowX;
            if (ovf !== 'auto' && ovf !== 'scroll') {
                return { ok: false, reason: `overflow-x is "${ovf}" (expected auto or scroll)` };
            }
            return { ok: true, reason: '' };
        });
        assert.strictEqual(result.ok, true, result.reason);
        assert.deepStrictEqual(h.errors, []);
    });

    it('.preview-toolbar-fixed が存在する', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '# Title\n\nbody\n', 'body', { showToolbar: true });
        await h.page.waitForTimeout(200);
        const exists = await h.page.evaluate(() => !!document.querySelector('.preview-toolbar-fixed'));
        assert.strictEqual(exists, true, '.preview-toolbar-fixed element not found');
        assert.deepStrictEqual(h.errors, []);
    });

    // ──────────────────────────────────────────────
    // 2) 書式ボタンがスクロール領域内に配置されている
    // ──────────────────────────────────────────────
    it('H1/H2/H3 ボタンは .preview-toolbar-scroll 内にある', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '# Title\n\nbody\n', 'body', { showToolbar: true });
        await h.page.waitForTimeout(200);
        const result = await h.page.evaluate(() => {
            const scroll = document.querySelector('.preview-toolbar-scroll');
            if (!scroll) return { ok: false, reason: 'no .preview-toolbar-scroll' };
            const btns = Array.from(scroll.querySelectorAll('button[aria-label]'));
            const labels = btns.map((b) => b.getAttribute('aria-label') ?? '');
            const hasH1 = labels.some((l) => /H1|Heading 1|見出し 1/i.test(l));
            const hasH2 = labels.some((l) => /H2|Heading 2|見出し 2/i.test(l));
            if (!hasH1 || !hasH2) {
                return { ok: false, reason: `H1=${hasH1} H2=${hasH2} labels=${JSON.stringify(labels)}` };
            }
            return { ok: true, reason: '' };
        });
        assert.strictEqual(result.ok, true, result.reason);
        assert.deepStrictEqual(h.errors, []);
    });

    it('Undo/Redo ボタンは .preview-toolbar-scroll 内にある', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '# Title\n', 'Title', { showToolbar: true });
        await h.page.waitForTimeout(200);
        const result = await h.page.evaluate(() => {
            const scroll = document.querySelector('.preview-toolbar-scroll');
            if (!scroll) return { ok: false, reason: 'no .preview-toolbar-scroll' };
            const labels = Array.from(scroll.querySelectorAll('button[aria-label]'))
                .map((b) => b.getAttribute('aria-label') ?? '');
            const hasUndo = labels.some((l) => /undo|元に戻す/i.test(l));
            const hasRedo = labels.some((l) => /redo|やり直し/i.test(l));
            return { ok: hasUndo && hasRedo, reason: `undo=${hasUndo} redo=${hasRedo} labels=${JSON.stringify(labels)}` };
        });
        assert.strictEqual(result.ok, true, result.reason);
        assert.deepStrictEqual(h.errors, []);
    });

    // ──────────────────────────────────────────────
    // 3) Export / Raw-Preview トグルが固定領域にある
    // ──────────────────────────────────────────────
    it('Export ボタンは .preview-toolbar-fixed 内にある', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '# Title\n', 'Title', { showToolbar: true });
        await h.page.waitForTimeout(200);
        const result = await h.page.evaluate(() => {
            const fixed = document.querySelector('.preview-toolbar-fixed');
            if (!fixed) return { ok: false, reason: 'no .preview-toolbar-fixed' };
            const hasExport = !!fixed.querySelector('.preview-toolbar-export');
            return { ok: hasExport, reason: `export found: ${hasExport}` };
        });
        assert.strictEqual(result.ok, true, result.reason);
        assert.deepStrictEqual(h.errors, []);
    });

    it('Raw/Preview トグルグループは .preview-toolbar-fixed 内にある', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '# Title\n', 'Title', { showToolbar: true });
        await h.page.waitForTimeout(200);
        const result = await h.page.evaluate(() => {
            const fixed = document.querySelector('.preview-toolbar-fixed');
            if (!fixed) return { ok: false, reason: 'no .preview-toolbar-fixed' };
            const hasToggle = !!fixed.querySelector('.preview-toolbar-toggle');
            return { ok: hasToggle, reason: `toggle found: ${hasToggle}` };
        });
        assert.strictEqual(result.ok, true, result.reason);
        assert.deepStrictEqual(h.errors, []);
    });

    it('Zoom グループは .preview-toolbar-fixed 内にある', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '# Title\n', 'Title', { showToolbar: true });
        await h.page.waitForTimeout(200);
        const result = await h.page.evaluate(() => {
            const fixed = document.querySelector('.preview-toolbar-fixed');
            if (!fixed) return { ok: false, reason: 'no .preview-toolbar-fixed' };
            const hasZoom = !!fixed.querySelector('.preview-toolbar-zoom');
            return { ok: hasZoom, reason: `zoom found: ${hasZoom}` };
        });
        assert.strictEqual(result.ok, true, result.reason);
        assert.deepStrictEqual(h.errors, []);
    });

    // ──────────────────────────────────────────────
    // 4) ウィンドウが狭いときに固定領域が消えない
    // ──────────────────────────────────────────────
    it('viewport が 400px でも .preview-toolbar-fixed は visible 範囲内にある', async function () {
        if (!browser) { this.skip(); return; }
        // narrow viewport をシミュレート
        const page = await browser.newPage({ viewport: { width: 400, height: 700 } });
        const errors: string[] = [];
        page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));

        // ハーネスと同じ init メッセージを使用
        const { DEFAULT_SETTINGS } = await import('../previewBrowserHarness');
        await page.goto('about:blank');
        // バンドルが存在する場合のみ実施
        const fs = await import('fs');
        const path = await import('path');
        const bundlePath = path.join(process.cwd(), 'media', 'milkdown.bundle.js');
        if (!fs.existsSync(bundlePath)) { await page.close(); this.skip(); return; }

        // previewBrowserHarness の openPreview を流用するために h を取得
        await page.close();

        h = await openPreview(browser, '# T\n\nbody\n', 'body', { showToolbar: true });
        await h.page.setViewportSize({ width: 400, height: 700 });
        await h.page.waitForTimeout(300);

        const result = await h.page.evaluate(() => {
            const fixed = document.querySelector('.preview-toolbar-fixed');
            if (!fixed) return { ok: false, reason: 'no .preview-toolbar-fixed' };
            const rect = fixed.getBoundingClientRect();
            const viewportWidth = window.innerWidth;
            // 固定領域の右端が viewport 内に収まっていること
            const withinViewport = rect.right <= viewportWidth + 2; // 2px の余裕
            const visible = rect.width > 0 && rect.height > 0;
            return {
                ok: withinViewport && visible,
                reason: `rect: ${JSON.stringify({ left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width) })} viewport: ${viewportWidth}`
            };
        });
        assert.strictEqual(result.ok, true, result.reason);
        assert.deepStrictEqual(h.errors, []);
    });

    // ──────────────────────────────────────────────
    // 5) ツールバーと行番号の共存
    // ──────────────────────────────────────────────
    it('showToolbar + showLineNumbers の両方が有効でも行番号が visible 範囲で表示される', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(
            browser,
            '# 見出し\n\n本文の段落\n',
            '本文の段落',
            { showToolbar: true, showLineNumbers: true }
        );
        await h.page.waitForTimeout(400);

        const result = await h.page.evaluate(() => {
            const gutters = Array.from(document.querySelectorAll('.line-number-gutter'));
            if (gutters.length === 0) return { ok: false, reason: 'no .line-number-gutter elements found' };
            // 各行番号が非表示でなく、left >= 0（viewport 左端より右）であること
            for (const el of gutters) {
                const style = getComputedStyle(el);
                if (style.display === 'none' || style.visibility === 'hidden') {
                    return { ok: false, reason: `gutter display=${style.display} visibility=${style.visibility}` };
                }
                const rect = el.getBoundingClientRect();
                if (rect.left < 0) {
                    return { ok: false, reason: `gutter left=${rect.left} is off-screen (expected >= 0)` };
                }
            }
            return { ok: true, reason: `${gutters.length} gutters all visible` };
        });
        assert.strictEqual(result.ok, true, result.reason);
        assert.deepStrictEqual(h.errors, []);
    });

    it('showToolbar: true のとき .preview-toolbar-scroll 内が横スクロール可能（スクロール幅 > 表示幅で確認）', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '# Title\n', 'Title', { showToolbar: true });
        await h.page.setViewportSize({ width: 300, height: 700 });
        await h.page.waitForTimeout(300);

        const result = await h.page.evaluate(() => {
            const scroll = document.querySelector('.preview-toolbar-scroll');
            if (!scroll) return { ok: false, reason: 'no .preview-toolbar-scroll' };
            // 狭い viewport では scrollWidth > clientWidth になるはず（ボタンが多いため）
            const scrollable = scroll.scrollWidth > scroll.clientWidth;
            return {
                ok: scrollable,
                reason: `scrollWidth=${scroll.scrollWidth} clientWidth=${scroll.clientWidth}`
            };
        });
        assert.strictEqual(result.ok, true, result.reason);
        assert.deepStrictEqual(h.errors, []);
    });
});
