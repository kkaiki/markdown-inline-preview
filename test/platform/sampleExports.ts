/**
 * 各 OS で、拡張と同じ部品を使って日本語のサンプルを PDF・スライド・Word・まとめた PDF に書き出し、
 * `sample-exports/` に保存する（テストではなく、人が開いて目で確かめるための書き出し）。
 *
 * ユーザー要望 2026-09-30:「Windows は何か仮想的にできたりしないでしょうか？」→ GitHub Actions の
 * Windows で実行し、成果物をダウンロードして見る（.github/workflows/windows.yml）。
 * 確かめたいこと: Chrome / Edge が Windows のパスで見つかるか、空白・日本語を含むフォルダでも書き出せるか、
 * 日本語が文字化けせずに出るか（フォントが無い環境で □ にならないか）。
 *
 * 実行: `npm run compile && node out-test/test/platform/sampleExports.js`
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as zlib from 'zlib';
import { pathToFileURL } from 'url';
import { buildPdfHtml, type PdfAssets } from '../../src/shared/pdfHtml';
import { buildMergedPdfHtml } from '../../src/shared/batchExport/mergedDocument';
import { DEFAULT_PDF_STYLING } from '../../src/shared/pdfStyling';
import { launchChromePdf } from '../../src/live/host/chromePdf';

const root = (() => {
    let dir = __dirname;
    while (!fs.existsSync(path.join(dir, 'package.json'))) dir = path.dirname(dir);
    return dir;
})();
const OUT = path.join(root, 'sample-exports');
// 空白と日本語を含むフォルダ（Windows のパス処理で壊れやすい）
const WORK = path.join(OUT, '日本語 フォルダ');

const url = (...parts: string[]) => pathToFileURL(path.join(root, ...parts)).href;
const ASSETS: PdfAssets = {
    runtimeScript: url('out', 'pdfRuntime.js'),
    katexCss: url('media', 'katex.min.css'),
    mermaidScript: url('out', 'mermaid.min.js')
};
const CSS = fs.readFileSync(path.join(root, 'media', 'pdf-export.css'), 'utf8');

function browsers(): { name: string; path: string }[] {
    const pf = process.env['PROGRAMFILES'] ?? 'C:\\Program Files';
    const pf86 = process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)';
    const lad = process.env['LOCALAPPDATA'] ?? '';
    const candidates: [string, string][] = [
        ['chrome', path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe')],
        ['chrome', path.join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe')],
        ['chrome', path.join(lad, 'Google', 'Chrome', 'Application', 'chrome.exe')],
        ['edge', path.join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe')],
        ['edge', path.join(pf86, 'Microsoft', 'Edge', 'Application', 'msedge.exe')],
        ['chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'],
        ['edge', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'],
        ['chrome', '/usr/bin/google-chrome-stable'],
        ['chrome', '/usr/bin/google-chrome']
    ];
    const found = new Map<string, string>();
    for (const [name, p] of candidates) {
        if (!found.has(name) && fs.existsSync(p)) found.set(name, p);
    }
    return [...found].map(([name, p]) => ({ name, path: p }));
}

function crc32(buf: Buffer): number {
    let c = 0xffffffff;
    for (const byte of buf) {
        c ^= byte;
        for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return (c ^ 0xffffffff) >>> 0;
}

/** 1 色の 16×16 PNG */
function solidPng(r: number, g: number, b: number): Buffer {
    const chunk = (type: string, data: Buffer) => {
        const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
        const len = Buffer.alloc(4);
        len.writeUInt32BE(data.length);
        const crc = Buffer.alloc(4);
        crc.writeUInt32BE(crc32(body));
        return Buffer.concat([len, body, crc]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(16, 0);
    ihdr.writeUInt32BE(16, 4);
    ihdr.set([8, 2, 0, 0, 0], 8);
    const row = Buffer.from([0, ...Array.from({ length: 16 }, () => [r, g, b]).flat()]);
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(Array(16).fill(row)))), chunk('IEND', Buffer.alloc(0))
    ]);
}

const SAMPLE = `# 日本語サンプル（Windows 確認用）

本文です。**太字**・*斜体*・~~取り消し~~・\`inline code\`・==ハイライト==・[リンク](https://example.com)。
漢字・ひらがな・カタカナ・全角記号「」（）【】・半角ｶﾀｶﾅ・絵文字 😀 ✅。

## リスト

- 普通の項目
  - 入れ子の項目
- [ ] 未完了のタスク
- [x] 完了したタスク

1. 番号 1
2. 番号 2

> [!NOTE]
> コールアウトの本文です。

## 表

| 名前 | 年齢 | 職種 |
|:--|--:|:-:|
| 田中 太郎 | 30 | エンジニア |
| 佐藤 花子 | 28 | デザイナー |

## コード

\`\`\`ts
function hello(name: string): string {
    return \`こんにちは、\${name}\`; // コメント
}
\`\`\`

## 数式

インライン $E = mc^2$ とブロック:

$$
\\int_0^1 x^2 dx = \\frac{1}{3}
$$

## Mermaid

\`\`\`mermaid
graph LR
  開始 --> 処理 --> 終了
\`\`\`

## 画像（空白と日本語を含むパス）

![赤い四角](<画像 フォルダ/赤.png>)
`;

async function main(): Promise<void> {
    fs.rmSync(OUT, { recursive: true, force: true });
    fs.mkdirSync(path.join(WORK, '画像 フォルダ'), { recursive: true });
    fs.mkdirSync(path.join(WORK, '第2章'), { recursive: true });
    fs.writeFileSync(path.join(WORK, '画像 フォルダ', '赤.png'), solidPng(220, 40, 40));
    fs.writeFileSync(path.join(WORK, 'サンプル.md'), SAMPLE);
    fs.writeFileSync(path.join(WORK, '第2章', '続き.md'), '# 第2章 続き\n\n[最初の章へ](../サンプル.md)\n\n![赤](<../画像 フォルダ/赤.png>)\n');

    const report: string[] = [`platform: ${process.platform} ${os.release()} / node ${process.version}`];
    const failures: string[] = [];
    const step = async (label: string, run: () => Promise<string>) => {
        try {
            report.push(`OK   ${label}: ${await run()}`);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            report.push(`FAIL ${label}: ${msg}`);
            failures.push(label);
        }
    };

    const found = browsers();
    report.push(`browsers: ${found.map((b) => `${b.name}=${b.path}`).join(' | ') || '(none)'}`);
    if (found.length === 0) failures.push('browser not found');

    const md = SAMPLE;
    for (const browser of found) {
        const session = await launchChromePdf(browser.path);
        try {
            // 単体の PDF（無料版: クレジット行あり）。一時 HTML は単体書き出しと同じく .md の隣に置く
            await step(`PDF (${browser.name})`, async () => {
                const html = path.join(WORK, `.ipreview-pdf-${browser.name}.html`);
                fs.writeFileSync(html, buildPdfHtml(md, CSS, { credit: true, assets: ASSETS }));
                const out = path.join(WORK, `サンプル (${browser.name}).pdf`);
                try {
                    await session.print(html, out, { timeoutMs: 120_000 });
                } finally {
                    fs.rmSync(html, { force: true });
                }
                return `${out} ${fs.statSync(out).size} bytes`;
            });
            // PDF の体裁（A4・ページ番号・ヘッダー・目次）
            await step(`PDF styled A4 (${browser.name})`, async () => {
                const html = path.join(WORK, `.ipreview-pdf-styled-${browser.name}.html`);
                fs.writeFileSync(html, buildPdfHtml(md, CSS, {
                    credit: false,
                    assets: ASSETS,
                    styling: { ...DEFAULT_PDF_STYLING, paperSize: 'A4', pageNumbers: true, headerText: '{title} — {date}', tableOfContents: true },
                    context: { title: 'サンプル', date: '2026-09-30', tocTitle: '目次' }
                }));
                const out = path.join(WORK, `サンプル A4 体裁付き (${browser.name}).pdf`);
                try {
                    await session.print(html, out, { timeoutMs: 120_000 });
                } finally {
                    fs.rmSync(html, { force: true });
                }
                return `${out} ${fs.statSync(out).size} bytes`;
            });
            // まとめて書き出し（1 冊）。一時 HTML は OS の一時フォルダ、画像は file:// の絶対パス
            await step(`merged PDF (${browser.name})`, async () => {
                const docs = [path.join(WORK, 'サンプル.md'), path.join(WORK, '第2章', '続き.md')]
                    .map((p) => ({ path: p, markdown: fs.readFileSync(p, 'utf8') }));
                const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ipreview-batch-'));
                const html = path.join(tmp, 'book.html');
                fs.writeFileSync(html, buildMergedPdfHtml(docs, CSS, { title: '本', tocTitle: '目次', credit: false, assets: ASSETS }));
                const out = path.join(WORK, `まとめ (${browser.name}).pdf`);
                try {
                    await session.print(html, out, { timeoutMs: 120_000, outline: true });
                } finally {
                    fs.rmSync(tmp, { recursive: true, force: true });
                }
                return `${out} ${fs.statSync(out).size} bytes`;
            });
            // Marp スライド
            await step(`Marp slides (${browser.name})`, async () => {
                const marp = require(path.join(root, 'out', 'marp.js')) as {
                    buildMarpHtml(markdown: string, o: { katexFontPath: string; title: string }): { html: string; slideCount: number };
                };
                const deck = marp.buildMarpHtml(md, { katexFontPath: `${url('media', 'fonts')}/`, title: 'サンプル' });
                const html = path.join(WORK, `.ipreview-marp-${browser.name}.html`);
                fs.writeFileSync(html, deck.html);
                const out = path.join(WORK, `サンプル.slides (${browser.name}).pdf`);
                try {
                    await session.print(html, out, { timeoutMs: 120_000 });
                } finally {
                    fs.rmSync(html, { force: true });
                }
                return `${out} ${deck.slideCount} slides`;
            });
        } finally {
            await session.close();
        }
    }

    // Word（ブラウザは使わない）
    await step('Word (.docx)', async () => {
        const docx = require(path.join(root, 'out', 'docxExport.js')) as {
            exportDocx(markdown: string, o: { title: string; resolveImage: (src: string) => { data: Uint8Array } | undefined }): Promise<{ data: Uint8Array; warnings: string[] }>;
        };
        const { data, warnings } = await docx.exportDocx(md, {
            title: 'サンプル',
            resolveImage: (src) => {
                const file = path.resolve(WORK, decodeURIComponent(src));
                return fs.existsSync(file) ? { data: fs.readFileSync(file) } : undefined;
            }
        });
        const out = path.join(WORK, 'サンプル.docx');
        fs.writeFileSync(out, data);
        return `${out} ${data.length} bytes${warnings.length ? ` warnings: ${warnings.join(' / ')}` : ''}`;
    });

    fs.writeFileSync(path.join(OUT, 'report.txt'), report.join('\n') + '\n');
    console.log(report.join('\n'));
    if (failures.length > 0) {
        console.error(`失敗: ${failures.join(', ')}`);
        process.exit(1);
    }
}

void main();
