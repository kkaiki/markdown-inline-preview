/**
 * まとめて書き出し（PRO+）の印刷部分（`src/live/host/chromePdf.ts`）を実 Chrome で確かめる。
 *
 * ユーザー決定（2026-09-28）: まとめて書き出しは PRO+（docs/private/specifications/pro-batch-export.md）。
 * 1 ファイルごとに Chrome を起動すると起動コストがファイル数ぶん掛かるので、Chrome を 1 回だけ起動して
 * DevTools プロトコル（--remote-debugging-pipe）で印刷を繰り返す。ここでは
 * 「続けて印刷できる」「@page の用紙が効く」「別フォルダの画像が束ねた PDF に入る」「しおりが付く」
 * 「終わらないページはファイル単位のタイムアウトで失敗にして次へ進める」「閉じれば Chrome と一時プロファイルが残らない」
 * を見る。並べ順や HTML の組み立ては test/suite/shared/batchExport.test.ts が固定している。
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as zlib from 'zlib';
import { execFileSync } from 'child_process';
import { launchChromePdf, type ChromePdfSession } from '../../../../src/live/host/chromePdf';
import { buildMergedPdfHtml } from '../../../../src/shared/batchExport/mergedDocument';
import { findChrome } from '../../chromePrint';

function crc32(buf: Buffer): number {
    let c = 0xffffffff;
    for (const byte of buf) {
        c ^= byte;
        for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return (c ^ 0xffffffff) >>> 0;
}

/** 1 色で塗った 4×4 の PNG（画像が PDF に入ったかを /Subtype /Image の数で見るため、色ごとに別物にする） */
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
    ihdr.writeUInt32BE(4, 0);
    ihdr.writeUInt32BE(4, 4);
    ihdr.set([8, 2, 0, 0, 0], 8);
    const row = Buffer.from([0, ...Array.from({ length: 4 }, () => [r, g, b]).flat()]);
    const raw = Buffer.concat([row, row, row, row]);
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))
    ]);
}

function count(pdf: string, re: RegExp): number {
    return (pdf.match(re) ?? []).length;
}

describe('まとめて書き出し: Chrome を 1 回起動して続けて印刷する（実 Chrome）', function () {
    this.timeout(180000);

    const chrome = findChrome();
    let dir: string;
    let session: ChromePdfSession | undefined;

    before(async function () {
        if (!chrome) { this.skip(); return; }
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ipreview-batch-test-'));
        session = await launchChromePdf(chrome);
    });

    after(async () => {
        await session?.close();
        if (dir) fs.rmSync(dir, { recursive: true, force: true });
    });

    const write = (name: string, html: string) => {
        const p = path.join(dir, name);
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, html);
        return p;
    };

    it('1 回の起動で 3 つの HTML を続けて印刷すると、3 つの PDF ができる', async () => {
        for (const n of [1, 2, 3]) {
            const html = write(`seq/${n}.html`, `<html><body><h1>文書 ${n}</h1></body></html>`);
            await session.print(html, path.join(dir, `seq/${n}.pdf`), { timeoutMs: 60000 });
        }
        for (const n of [1, 2, 3]) {
            assert.strictEqual(fs.readFileSync(path.join(dir, `seq/${n}.pdf`)).subarray(0, 5).toString('latin1'), '%PDF-');
        }
    });

    it('@page { size: A5 } を書いた HTML を印刷すると、PDF の用紙が A5（420 × 595 pt）になる', async () => {
        const html = write('a5.html', '<html><head><style>@page { size: A5; }</style></head><body><p>A5</p></body></html>');
        const out = path.join(dir, 'a5.pdf');
        await session.print(html, out, { timeoutMs: 60000 });
        const box = /\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(fs.readFileSync(out, 'latin1'));
        assert.deepStrictEqual([Math.round(Number(box?.[1])), Math.round(Number(box?.[2]))], [420, 595]);
    });

    it('別々のフォルダの画像を持つ文書を束ねて、一時フォルダの HTML から印刷しても、画像が両方 PDF に入る', async () => {
        const src = path.join(dir, 'book');
        fs.mkdirSync(path.join(src, 'chapter1', 'img'), { recursive: true });
        fs.mkdirSync(path.join(src, 'assets'), { recursive: true });
        fs.writeFileSync(path.join(src, 'assets', 'red.png'), solidPng(255, 0, 0));
        fs.writeFileSync(path.join(src, 'chapter1', 'img', 'blue.png'), solidPng(0, 0, 255));
        const merged = buildMergedPdfHtml([
            { path: path.join(src, 'README.md'), markdown: '# はじめに\n\n![赤](assets/red.png)\n' },
            { path: path.join(src, 'chapter1', 'intro.md'), markdown: '# 第1章\n\n![青](img/blue.png)\n' }
        ], '', { title: 'book', tocTitle: '目次', credit: false });
        const html = write('elsewhere/book.html', merged);
        const out = path.join(dir, 'book.pdf');
        await session.print(html, out, { timeoutMs: 60000 });
        assert.strictEqual(count(fs.readFileSync(out, 'latin1'), /\/Subtype\s*\/Image/g), 2);
    });

    it('しおりを付けて印刷すると PDF に /Outlines が入り、付けなければ入らない', async () => {
        const html = write('outline.html', '<html><body><h1>一</h1><h2>二</h2></body></html>');
        await session.print(html, path.join(dir, 'with.pdf'), { timeoutMs: 60000, outline: true });
        await session.print(html, path.join(dir, 'without.pdf'), { timeoutMs: 60000 });
        assert.ok(count(fs.readFileSync(path.join(dir, 'with.pdf'), 'latin1'), /\/Outlines/g) > 0);
        assert.strictEqual(count(fs.readFileSync(path.join(dir, 'without.pdf'), 'latin1'), /\/Outlines/g), 0);
    });

    it('ページが window.__ipreviewReady を置いていれば、それが解決する（描画が終わる）まで待ってから印刷する', async function () {
        const html = write('late.html', `<html><body><p>EARLY</p><script>
            window.__ipreviewReady = new Promise((resolve) => setTimeout(() => {
                const p = document.createElement('p'); p.textContent = 'LATEWORD'; document.body.append(p); resolve();
            }, 1500));
        </script></body></html>`);
        const out = path.join(dir, 'late.pdf');
        await session.print(html, out, { timeoutMs: 60000 });
        let text: string;
        try {
            text = execFileSync('pdftotext', [out, '-'], { encoding: 'utf8' });
        } catch {
            this.skip();
            return;
        }
        assert.ok(text.includes('LATEWORD'), `描画の完了を待たずに印刷した: ${text}`);
    });

    it('読み込みが終わらないページはそのファイルだけタイムアウトで失敗し、同じ Chrome で次のファイルを印刷できる', async () => {
        const hang = write('hang.html', '<html><body><p>x</p><script>for(;;){}</script></body></html>');
        const started = Date.now();
        await assert.rejects(session.print(hang, path.join(dir, 'hang.pdf'), { timeoutMs: 3000 }), /time/i);
        assert.ok(Date.now() - started < 20000, `タイムアウトまで ${Date.now() - started}ms`);
        assert.ok(!fs.existsSync(path.join(dir, 'hang.pdf')));

        const ok = write('after-hang.html', '<html><body><p>ok</p></body></html>');
        await session.print(ok, path.join(dir, 'after-hang.pdf'), { timeoutMs: 60000 });
        assert.ok(fs.existsSync(path.join(dir, 'after-hang.pdf')));
    });
});

describe('まとめて書き出し: Chrome の後始末（実 Chrome）', function () {
    this.timeout(120000);
    const chrome = findChrome();

    it('閉じると Chrome が終了して一時プロファイルが消え、閉じた後の印刷は待たずに失敗する', async function () {
        if (!chrome) { this.skip(); return; }
        const session = await launchChromePdf(chrome);
        const profile = session.profileDir;
        assert.ok(fs.existsSync(profile));
        await session.close();
        assert.ok(!fs.existsSync(profile), `残っている: ${profile}`);
        await assert.rejects(session.print('/nonexistent.html', '/nonexistent.pdf', { timeoutMs: 60000 }));
    });

    it('起動できないブラウザを指定すると、待ち続けずに失敗する', async () => {
        const started = Date.now();
        await assert.rejects(launchChromePdf('/nonexistent/chrome', { launchTimeoutMs: 20000 }));
        assert.ok(Date.now() - started < 10000);
    });
});
