/**
 * 拡張と同じ手順（ローカル Chrome ヘッドレスの --print-to-pdf）で HTML を PDF にし、
 * 用紙寸法とページ数を読むテスト用の部品。PDF 書き出し（pdfLayout.test.ts）と
 * Marp 書き出し（marpPdf.test.ts）が使う。Chrome が無い環境では null を返す（呼び出し側で skip）。
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';

export interface PrintedPdf {
    /** 1 ページ目の用紙（pt、四捨五入） */
    width: number;
    height: number;
    /** 全ページの用紙（pt、四捨五入） */
    pages: { width: number; height: number }[];
}

export function findChrome(): string | undefined {
    return [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium'
    ].find((p) => fs.existsSync(p));
}

export function printHtml(html: string): PrintedPdf | null {
    const chrome = findChrome();
    if (!chrome) return null;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ipreview-pdf-'));
    try {
        const htmlPath = path.join(dir, 'doc.html');
        const pdfPath = path.join(dir, 'doc.pdf');
        fs.writeFileSync(htmlPath, html);
        execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-pdf-header-footer',
            `--print-to-pdf=${pdfPath}`, `file://${htmlPath}`], { stdio: 'ignore', timeout: 120000 });
        const pdf = fs.readFileSync(pdfPath, 'latin1');
        const pages = [...pdf.matchAll(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/g)].map((m) => ({
            width: Math.round(Number(m[1])),
            height: Math.round(Number(m[2]))
        }));
        if (pages.length === 0) return null;
        return { width: pages[0].width, height: pages[0].height, pages };
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}
