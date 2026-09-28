/**
 * PDF 書き出し用 HTML（`buildPdfHtml` + `media/pdf-export.css`）が、印刷の紙幅に収まること（実 Chromium）。
 *
 * ユーザー報告（2026-09-28）:「そもそもうまく pdf 出力できていないです」。実際の PDF では
 * 本文・表・コードブロックが全ページで右端から切れていた。原因は2つ:
 *   1. 無料版はクレジット行を各ページへ繰り返すために本文を `<table>` で包むが、表のセルは
 *      中身の「折り返せない最小幅」まで広がる。幅の広い表や長いコード行が1つあるだけで
 *      本文全体が紙幅を超えた（クレジット行も紙の中央からずれて見えた）
 *   2. 紙はスクロールできないのに、コードブロックが `overflow: auto`（折り返さない）だった
 *
 * 紙に出せるかどうかは実 DOM のレイアウトでしか分からないので、印刷メディアを
 * エミュレートし、Letter（8.5in = 816px）から Chrome 既定の余白を引いた幅で描画して確かめる。
 * PDF そのものの見た目（tfoot の各ページ繰り返し）は自動化できないので、CSS を変えたら
 * 複数ページの PDF を作って目視すること（docs/testing/spec-test-coverage.md の注記）。
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import type { Browser, Page } from 'playwright';
import { launchBrowser } from '../../liveBrowserHarness';
import { buildPdfHtml, PDF_CREDIT_TEXT } from '../../../../src/shared/pdfHtml';

/** 印刷時の本文幅（Letter 816px − 既定余白 約 38px × 2）。 */
const PRINT_WIDTH = 740;

const repoRoot = (() => {
    let dir = __dirname;
    while (!fs.existsSync(path.join(dir, 'package.json'))) dir = path.dirname(dir);
    return dir;
})();
const CSS = fs.readFileSync(path.join(repoRoot, 'media', 'pdf-export.css'), 'utf8');

const LONG_PATH = 'tests/infrastructure/database/example/test_really_long_module_name_for_layout_check.py';
const DOC = [
    '# 進捗メモ',
    '',
    '| ファイル | 中身 |',
    '|---|---|',
    `| \`scripts/tool/board.py\` | ボードの JSON を読み込んで、API 応答とエクスポートが同じ形であることを前提に辞書へ変換する。 \`${LONG_PATH}\` |`,
    '',
    `- **長いリスト項目**: 設計書の決定 3 は「両方投入してグループ ID を振る」だが、回答は「誤作成です」だったので \`${LONG_PATH}\` に寄せた。`,
    '',
    `長い一語: ${'x'.repeat(160)}`,
    '',
    '```',
    `by year: ${Array.from({ length: 40 }, (_, i) => `(${2000 + i}, ${i * 7})`).join(', ')}`,
    'short line',
    '```',
    ''
].join('\n');

/** 本文中で、紙幅からはみ出している（か、中身が切れている）要素を列挙する。 */
async function overflows(page: Page): Promise<string[]> {
    return page.evaluate<string[], number>((width) => {
        const found: string[] = [];
        for (const el of Array.from(document.body.querySelectorAll('*'))) {
            const r = el.getBoundingClientRect();
            if (r.width === 0) continue;
            const tag = el.tagName.toLowerCase();
            if (r.right > width + 1) found.push(`${tag} の右端 ${Math.round(r.right)}px > ${width}px`);
            if (tag === 'pre' && el.scrollWidth > el.clientWidth + 1) {
                found.push(`pre の中身が ${el.scrollWidth - el.clientWidth}px 切れている`);
            }
        }
        return found;
    }, PRINT_WIDTH);
}

describe('PDF 書き出し: 紙幅に収まる（実ブラウザ）', function () {
    this.timeout(120000);

    let browser: Browser | null = null;
    let page: Page | undefined;

    before(async () => {
        browser = await launchBrowser();
    });
    after(async function () {
        this.timeout(60000);
        await browser?.close();
    });
    afterEach(async () => {
        await page?.close();
        page = undefined;
    });

    async function render(credit: boolean): Promise<Page> {
        if (!browser) throw new Error('ブラウザが起動していない');
        const p = await browser.newPage({ viewport: { width: PRINT_WIDTH, height: 1000 } });
        await p.emulateMedia({ media: 'print' });
        await p.setContent(buildPdfHtml(DOC, CSS, { credit }));
        return p;
    }

    for (const credit of [true, false]) {
        const who = credit ? '無料版（クレジット行あり）' : '購入者（クレジット行なし）';

        it(`${who}: 幅の広い表・長いコード行・長い一語があっても、本文が紙幅からはみ出さない`, async function () {
            if (!browser) { this.skip(); return; }
            page = await render(credit);
            assert.deepStrictEqual(await overflows(page), []);
        });

        it(`${who}: コードブロックの長い行は切れずに折り返される`, async function () {
            if (!browser) { this.skip(); return; }
            page = await render(credit);
            // 元は2行（長い行 + short line）。折り返していれば表示上は3行以上になる
            const lines = await page.evaluate<number>(`(() => {
                const pre = document.querySelector('pre');
                const cs = getComputedStyle(pre);
                const inner = pre.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
                return inner / parseFloat(cs.lineHeight);
            })()`);
            assert.ok(lines > 2.5, `コードブロックが折り返されていない（表示 ${lines.toFixed(1)} 行）`);
        });
    }

    it('無料版と購入者で本文の文字サイズが同じ（買う前と後で PDF のレイアウトが変わらない）', async function () {
        if (!browser) { this.skip(); return; }
        const sizes: string[] = [];
        for (const credit of [true, false]) {
            const p = await render(credit);
            sizes.push(await p.evaluate<string>(`getComputedStyle(document.querySelector('li')).fontSize`));
            await p.close();
        }
        assert.strictEqual(sizes[0], sizes[1], `無料版 ${sizes[0]} / 購入者 ${sizes[1]}`);
    });

    it('無料版のクレジット行は紙の中央に出る（包みの表が紙幅より広がらない）', async function () {
        if (!browser) { this.skip(); return; }
        page = await render(true);
        const center = await page.evaluate<number>(`(() => {
            const el = document.querySelector('.ipreview-credit');
            const r = el.getBoundingClientRect();
            return r.left + r.width / 2;
        })()`);
        assert.ok(Math.abs(center - PRINT_WIDTH / 2) < 20, `クレジット行の中心 ${Math.round(center)}px（紙の中心 ${PRINT_WIDTH / 2}px）`);
        assert.strictEqual(
            (await page.locator('tfoot .ipreview-credit').textContent())?.trim(),
            PDF_CREDIT_TEXT,
            '各ページへ繰り返すための tfoot にクレジット行が無い'
        );
    });
});
