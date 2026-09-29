/**
 * PDF 書き出しで、数式・Mermaid・コールアウト・ハイライト・コードの色分けが実際に描かれ、
 * 箇条書きとチェックボックスが混ざったリストの行頭記号が消えず、クレジット行がどのページでも
 * 紙の下端に出ること（実 Chromium / 実 Chrome の PDF）。
 *
 * ユーザー指摘 2026-09-29:「PDF は ⌘P で PDF にプリントと同じ？ 少し出力された結果が変」→
 * 調査 docs/private/pdf-output-gaps-2026-09-29.md →「A で全部直して」。
 *
 * 描画は印刷する Chrome の中で `out/pdfRuntime.js`（KaTeX・highlight.js）と `out/mermaid.min.js` が行い、
 * 終わったら `window.__ipreviewReady` を解決する。印刷側（chromePdf）はそれを待ってから印刷する。
 * どの要素に置き換えるかは test/suite/shared/pdfHtmlRendering.test.ts（純関数）が固定している。
 * 実行前に `npm run build:lazy`（描画スクリプトのバンドル）が必要。
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { pathToFileURL } from 'url';
import type { Browser, Page } from 'playwright';
import { launchBrowser } from '../../liveBrowserHarness';
import { findChrome } from '../../chromePrint';
import { buildPdfHtml, PDF_CREDIT_TEXT, type PdfAssets } from '../../../../src/shared/pdfHtml';
import { launchChromePdf } from '../../../../src/live/host/chromePdf';

const repoRoot = (() => {
    let dir = __dirname;
    while (!fs.existsSync(path.join(dir, 'package.json'))) dir = path.dirname(dir);
    return dir;
})();
const CSS = fs.readFileSync(path.join(repoRoot, 'media', 'pdf-export.css'), 'utf8');
const ASSETS: PdfAssets = {
    runtimeScript: pathToFileURL(path.join(repoRoot, 'out', 'pdfRuntime.js')).href,
    katexCss: pathToFileURL(path.join(repoRoot, 'media', 'katex.min.css')).href,
    mermaidScript: pathToFileURL(path.join(repoRoot, 'out', 'mermaid.min.js')).href
};

const SAMPLE = [
    '# サンプル',
    '',
    'ハイライト ==重要== とインライン数式 $E = mc^2$。',
    '',
    '$$',
    '\\int_0^1 x^2 dx = \\frac{1}{3}',
    '$$',
    '',
    '- 普通の項目',
    '  - 入れ子',
    '- [ ] 未完了のタスク',
    '- [x] 完了したタスク',
    '',
    '> [!NOTE]',
    '> コールアウトの本文',
    '',
    '```ts',
    'function hello(name: string): string {',
    '    return name; // コメント',
    '}',
    '```',
    '',
    '```mermaid',
    'graph LR',
    '  A --> B',
    '```',
    ''
].join('\n');

describe('PDF 書き出し: エディタと同じ記法が描かれる（実ブラウザ）', function () {
    this.timeout(180000);

    let browser: Browser | null = null;
    let page: Page | undefined;
    let dir: string;

    before(async function () {
        if (!fs.existsSync(path.join(repoRoot, 'out', 'pdfRuntime.js'))) {
            throw new Error('out/pdfRuntime.js が無い。先に npm run build:lazy を実行する');
        }
        browser = await launchBrowser();
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ipreview-pdf-render-'));
        if (!browser) return;
        const file = path.join(dir, 'doc.html');
        fs.writeFileSync(file, buildPdfHtml(SAMPLE, CSS, { credit: true, assets: ASSETS }));
        page = await browser.newPage();
        await page.emulateMedia({ media: 'print' });
        await page.goto(pathToFileURL(file).href);
        await page.evaluate('Promise.resolve(window.__ipreviewReady)');
    });
    after(async function () {
        this.timeout(60000);
        await page?.close();
        await browser?.close();
        if (dir) fs.rmSync(dir, { recursive: true, force: true });
    });

    const q = <T>(expr: string) => (page).evaluate<T>(expr);

    it('インライン数式とブロック数式が KaTeX で描かれる（$ の記号は残らない）', async function () {
        if (!page) { this.skip(); return; }
        assert.strictEqual(await q<number>(`document.querySelectorAll('span.ipreview-math .katex').length`), 1);
        assert.strictEqual(await q<number>(`document.querySelectorAll('.ipreview-math-display .katex-display').length`), 1);
        assert.ok(!(await q<string>('document.body.innerText')).includes('$E'), '記号の $ が残っている');
    });

    it('Mermaid のコードは図（SVG）として描かれる', async function () {
        if (!page) { this.skip(); return; }
        assert.strictEqual(await q<number>(`document.querySelectorAll('.ipreview-mermaid svg').length`), 1);
    });

    it('言語を書いたコードブロックは色分けされる（キーワードとコメントが別の色）', async function () {
        if (!page) { this.skip(); return; }
        const [keyword, comment, plain] = await q<[string, string, string]>(`[
            getComputedStyle(document.querySelector('code.language-ts .hljs-keyword')).color,
            getComputedStyle(document.querySelector('code.language-ts .hljs-comment')).color,
            getComputedStyle(document.querySelector('code.language-ts')).color
        ]`);
        assert.notStrictEqual(keyword, plain, 'キーワードに色が付いていない');
        assert.notStrictEqual(comment, plain, 'コメントに色が付いていない');
    });

    it('コールアウトは色付きの枠と見出しで描かれる', async function () {
        if (!page) { this.skip(); return; }
        const [title, border] = await q<[string, string]>(`[
            document.querySelector('.ipreview-callout-note .ipreview-callout-title').innerText.trim(),
            getComputedStyle(document.querySelector('.ipreview-callout-note')).borderLeftStyle
        ]`);
        assert.strictEqual(title, 'Note');
        assert.strictEqual(border, 'solid');
    });

    it('==重要== は背景色付きで描かれる', async function () {
        if (!page) { this.skip(); return; }
        const bg = await q<string>(`getComputedStyle(document.querySelector('mark')).backgroundColor`);
        assert.notStrictEqual(bg, 'rgba(0, 0, 0, 0)');
    });

    it('箇条書きとチェックボックスが混ざったリストで、普通の項目の行頭記号が消えない', async function () {
        if (!page) { this.skip(); return; }
        const [plainItem, taskItem] = await q<[string, string]>(`(() => {
            const items = [...document.querySelectorAll('body > ul > li')];
            const plain = items.find((li) => !li.querySelector(':scope > input'));
            const task = items.find((li) => li.querySelector(':scope > input'));
            return [getComputedStyle(plain).listStyleType, getComputedStyle(task).listStyleType];
        })()`);
        assert.strictEqual(plainItem, 'disc');
        assert.strictEqual(taskItem, 'none');
    });
});

describe('PDF 書き出し: 印刷した PDF（実 Chrome）', function () {
    this.timeout(180000);

    const chrome = findChrome();
    let dir: string;

    before(function () {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ipreview-pdf-print-'));
    });
    after(() => {
        if (dir) fs.rmSync(dir, { recursive: true, force: true });
    });

    /** pdftotext -bbox の結果から、ページごとの高さとクレジット行（"Made"）の上端を読む */
    function creditPositions(pdf: string): { height: number; creditTop: number | null }[] | null {
        let out: string;
        try {
            out = execFileSync('pdftotext', ['-bbox', pdf, '-'], { encoding: 'utf8' });
        } catch {
            return null;
        }
        return out.split(/<page /).slice(1).map((pageXml) => {
            const height = Number(/height="([\d.]+)"/.exec(pageXml)?.[1]);
            const made = /<word xMin="[\d.]+" yMin="([\d.]+)"[^>]*>Made<\/word>/.exec(pageXml);
            return { height, creditTop: made ? Number(made[1]) : null };
        });
    }

    it('クレジット行は最後のページも含め、どのページでも紙の下端に出る', async function () {
        if (!chrome) { this.skip(); return; }
        // 2 ページ目が途中で終わる長さにする（以前は最後のページだけ本文の直後に出ていた）
        const md = Array.from({ length: 70 }, (_, i) => `段落 ${i + 1}`).join('\n\n');
        const html = path.join(dir, 'credit.html');
        fs.writeFileSync(html, buildPdfHtml(md, CSS, { credit: true, assets: ASSETS }));
        const out = path.join(dir, 'credit.pdf');
        const session = await launchChromePdf(chrome);
        try {
            await session.print(html, out, { timeoutMs: 60000 });
        } finally {
            await session.close();
        }
        const pages = creditPositions(out);
        if (!pages) { this.skip(); return; }
        assert.ok(pages.length >= 2, `ページ数: ${pages.length}`);
        for (const [i, p] of pages.entries()) {
            assert.ok(p.creditTop !== null, `${i + 1} ページ目にクレジット行が無い`);
            assert.ok(p.creditTop > p.height * 0.93, `${i + 1} ページ目のクレジット行が下端にない: ${p.creditTop} / ${p.height}`);
        }
        assert.ok(fs.readFileSync(out, 'latin1').length > 0);
        assert.ok(PDF_CREDIT_TEXT.startsWith('Made'));
    });

    it('購入者の PDF にはクレジット行が出ない', async function () {
        if (!chrome) { this.skip(); return; }
        const html = path.join(dir, 'paid.html');
        fs.writeFileSync(html, buildPdfHtml('# 見出し\n\n本文', CSS, { credit: false, assets: ASSETS }));
        const out = path.join(dir, 'paid.pdf');
        const session = await launchChromePdf(chrome);
        try {
            await session.print(html, out, { timeoutMs: 60000 });
        } finally {
            await session.close();
        }
        const pages = creditPositions(out);
        if (!pages) { this.skip(); return; }
        assert.ok(pages.every((p) => p.creditTop === null));
    });
});
