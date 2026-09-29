/**
 * Word（.docx）書き出し（PRO+）の変換（`src/shared/docx/`）を固定する。
 *
 * ユーザー決定（2026-09-28）: Word 書き出しは PRO+。`docx`（npm）で、PDF と同じ `marked` の
 * トークンを Word の文書に写す（設計: docs/private/specifications/pro-docx-export.md）。
 * 見た目ではなく、生成した docx の中の XML（document.xml / numbering.xml / styles.xml）の構造で確かめる。
 * 実際の Word での見え方（修復ダイアログが出ない・日本語・表・番号）は手動で確認する。
 */
import * as assert from 'assert';
import JSZip from 'jszip';
import { exportDocx } from '../../../src/shared/docx/docxExportEntry';
import { imageInfo } from '../../../src/shared/docx/imageInfo';
import type { MarkdownToDocxOptions } from '../../../src/shared/docx/markdownDocx';

interface Parts {
    document: string;
    numbering: string;
    styles: string;
    rels: string;
    files: string[];
    warnings: string[];
}

async function convert(markdown: string, opts: MarkdownToDocxOptions = {}): Promise<Parts> {
    const { data, warnings } = await exportDocx(markdown, opts);
    const zip = await JSZip.loadAsync(data);
    const read = async (name: string): Promise<string> => (await zip.file(name)?.async('string')) ?? '';
    return {
        document: await read('word/document.xml'),
        numbering: await read('word/numbering.xml'),
        styles: await read('word/styles.xml'),
        rels: await read('word/_rels/document.xml.rels'),
        files: Object.keys(zip.files),
        warnings
    };
}

/** document.xml の段落（<w:p>…</w:p>）を順に取り出す。 */
function paragraphs(xml: string): string[] {
    return xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? [];
}

/** 段落の中の文字を連結する。 */
function textOf(p: string): string {
    return [...p.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('');
}

function paragraphWith(xml: string, text: string): string {
    const found = paragraphs(xml).find((p) => textOf(p).includes(text));
    assert.ok(found, `「${text}」の段落が無い`);
    return found;
}

/** 最小の PNG（ヘッダだけ。IHDR の幅と高さを読めればよい）。 */
function png(width: number, height: number): Uint8Array {
    const be = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
    return new Uint8Array([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, ...be(width), ...be(height), 8, 2, 0, 0, 0, 0, 0, 0, 0
    ]);
}

describe('Word 書き出し: 見出し・文字の書式', () => {
    it('見出し 1〜6 は Heading1〜Heading6 スタイルの段落になる', async () => {
        const { document } = await convert('# 一\n\n## 二\n\n### 三\n\n#### 四\n\n##### 五\n\n###### 六\n');
        ['一', '二', '三', '四', '五', '六'].forEach((text, i) => {
            assert.ok(paragraphWith(document, text).includes(`<w:pStyle w:val="Heading${i + 1}"/>`), text);
        });
    });

    it('太字・斜体・取り消し線が入れ子でも文字の書式として残る', async () => {
        const { document } = await convert('**太字と*斜体*と~~消し~~**\n');
        const runs = document.match(/<w:r>[\s\S]*?<\/w:r>/g) ?? [];
        const run = (text: string) => runs.find((r) => textOf(r) === text) ?? '';
        assert.ok(run('太字と').includes('<w:b/>'));
        assert.ok(run('斜体').includes('<w:b/>') && run('斜体').includes('<w:i/>'));
        assert.ok(run('消し').includes('<w:strike/>'));
    });

    it('インラインコードは等幅フォントと網掛けになる', async () => {
        const { document } = await convert('実行は `npm test` で行う\n');
        const run = (document.match(/<w:r>[\s\S]*?<\/w:r>/g) ?? []).find((r) => textOf(r) === 'npm test') ?? '';
        assert.ok(run.includes('Consolas'), run);
        assert.ok(run.includes('<w:shd'), run);
    });

    it('https のリンクは外部ハイパーリンクになり、相対リンクは文字だけ残る', async () => {
        const { document, rels } = await convert('[公式](https://example.com/) と [隣](./other.md)\n');
        assert.strictEqual((document.match(/<w:hyperlink /g) ?? []).length, 1);
        assert.ok(rels.includes('Target="https://example.com/"'));
        assert.ok(textOf(paragraphWith(document, '公式')).includes('隣'));
    });
});

describe('Word 書き出し: リスト', () => {
    it('箇条書きは入れ子の深さが番号付けの階層（ilvl）になる', async () => {
        const { document } = await convert('- 親\n  - 子\n    - 孫\n');
        assert.ok(paragraphWith(document, '親').includes('<w:ilvl w:val="0"/>'));
        assert.ok(paragraphWith(document, '子').includes('<w:ilvl w:val="1"/>'));
        assert.ok(paragraphWith(document, '孫').includes('<w:ilvl w:val="2"/>'));
    });

    it('別々の番号付きリストは、それぞれ別の番号定義を参照する（Word 以外でも 1 から振り直される）', async () => {
        const { document } = await convert('1. あ\n2. い\n\n段落\n\n1. う\n2. え\n');
        const numId = (text: string) => /<w:numId w:val="(\d+)"\/>/.exec(paragraphWith(document, text))?.[1];
        assert.strictEqual(numId('あ'), numId('い'));
        assert.notStrictEqual(numId('あ'), numId('う'));
    });

    it('「5.」で始まる番号付きリストは 5 から始まる', async () => {
        const { numbering } = await convert('5. 五\n6. 六\n');
        assert.ok(numbering.includes('<w:start w:val="5"/>'), numbering.slice(0, 400));
    });

    it('タスクリストは完了が ☑、未完了が ☐ で始まり、黒丸の番号付けを持たない', async () => {
        const { document } = await convert('- [x] 済み\n- [ ] まだ\n');
        const done = paragraphWith(document, '済み');
        const todo = paragraphWith(document, 'まだ');
        assert.ok(textOf(done).startsWith('☑'), textOf(done));
        assert.ok(textOf(todo).startsWith('☐'), textOf(todo));
        assert.ok(!done.includes('<w:numPr>') && !todo.includes('<w:numPr>'));
    });
});

describe('Word 書き出し: 表・コード・引用', () => {
    const TABLE = '| 名前 | 数 | メモ |\n|:---|:---:|---:|\n| 東日本 | 12 | 伸びている |\n';

    it('表はヘッダー行が各ページで繰り返され、太字になる', async () => {
        const { document } = await convert(TABLE);
        const header = /<w:tr>[\s\S]*?<\/w:tr>/.exec(document)?.[0] ?? '';
        assert.ok(header.includes('<w:tblHeader/>'), header.slice(0, 300));
        assert.ok(header.includes('<w:b/>'));
    });

    it('表の列の寄せ（左・中央・右）が段落の配置になる', async () => {
        const { document } = await convert(TABLE);
        assert.ok(paragraphWith(document, '12').includes('<w:jc w:val="center"/>'));
        assert.ok(paragraphWith(document, '伸びている').includes('<w:jc w:val="right"/>'));
    });

    it('表の列幅は、全角を 2 と数えた表示幅で按分される', async () => {
        const { document } = await convert('| 日本語の長い見出し | a |\n|---|---|\n| x | y |\n');
        const cols = [...document.matchAll(/<w:gridCol w:w="(\d+)"\/>/g)].map((m) => Number(m[1]));
        assert.strictEqual(cols.length, 2);
        assert.ok(cols[0] > cols[1] * 3, `列幅 ${cols.join(', ')}`);
    });

    it('コードブロックは先頭の空白を保ったまま、改行で 1 段落に並ぶ', async () => {
        const { document } = await convert('```js\nif (x) {\n    return 1;\n}\n```\n');
        const code = paragraphWith(document, 'return 1;');
        assert.ok(code.includes('xml:space="preserve">    return 1;<'), code.slice(0, 400));
        assert.strictEqual((code.match(/<w:br\/>/g) ?? []).length, 2);
        assert.ok(code.includes('Consolas'));
    });

    it('引用は左の罫線と字下げの段落になる', async () => {
        const { document } = await convert('> 引用文\n');
        const quote = paragraphWith(document, '引用文');
        assert.ok(quote.includes('<w:left ') && quote.includes('<w:ind '), quote);
    });
});

describe('Word 書き出し: 画像', () => {
    it('ローカル画像は埋め込まれ、本文幅を超えると縦横比を保って縮小される', async () => {
        const { document, files } = await convert('![図](./big.png)\n', {
            resolveImage: (src) => (src === './big.png' ? { data: png(2000, 1000) } : undefined)
        });
        assert.ok(files.some((f) => f.startsWith('word/media/')), '画像が埋め込まれていない');
        const extent = /<wp:extent cx="(\d+)" cy="(\d+)"\/>/.exec(document);
        assert.ok(extent, '画像の大きさが無い');
        const [cx, cy] = [Number(extent[1]), Number(extent[2])];
        assert.ok(Math.abs(cx / cy - 2) < 0.01, `縦横比 ${cx}/${cy}`);
        assert.ok(cx < 2000 * 9525, '縮小されていない');
    });

    it('読めない画像・リモート画像は [代替テキスト] を残し、warnings に載る', async () => {
        const { document, warnings } = await convert('![無い](./missing.png)\n\n![外](https://example.com/a.png)\n', {
            resolveImage: () => undefined
        });
        assert.ok(textOf(paragraphWith(document, '[無い]')).includes('[無い]'));
        assert.ok(textOf(paragraphWith(document, '[外]')).includes('[外]'));
        assert.strictEqual(warnings.length, 2);
    });

    it('リモート画像は取りに行かない（resolveImage にも渡さない）', async () => {
        const asked: string[] = [];
        await convert('![外](https://example.com/a.png)\n', { resolveImage: (src) => { asked.push(src); return undefined; } });
        assert.deepStrictEqual(asked, []);
    });

    it('画像の種類と大きさを先頭のバイト列から読む（PNG・JPEG・GIF・BMP、知らない形式は undefined）', () => {
        assert.deepStrictEqual(imageInfo(png(640, 480)), { type: 'png', width: 640, height: 480 });
        const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0, 17, 8, 0x01, 0xe0, 0x02, 0x80, 3, 0, 0, 0, 0, 0, 0]);
        assert.deepStrictEqual(imageInfo(jpeg), { type: 'jpg', width: 640, height: 480 });
        const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x80, 0x02, 0xe0, 0x01, 0, 0]);
        assert.deepStrictEqual(imageInfo(gif), { type: 'gif', width: 640, height: 480 });
        const bmp = new Uint8Array(30);
        bmp.set([0x42, 0x4d], 0);
        bmp.set([0x80, 0x02], 18);
        bmp.set([0xe0, 0x01], 22);
        assert.deepStrictEqual(imageInfo(bmp), { type: 'bmp', width: 640, height: 480 });
        assert.strictEqual(imageInfo(new Uint8Array([1, 2, 3, 4, 5, 6])), undefined);
    });
});

describe('Word 書き出し: 文書全体', () => {
    it('本文の東アジアフォントが Yu Gothic、言語が ja-JP になる', async () => {
        const { styles } = await convert('本文\n');
        assert.ok(styles.includes('w:eastAsia="Yu Gothic"'), '東アジアフォントが Yu Gothic でない');
        assert.ok(styles.includes('w:eastAsia="ja-JP"'), '言語が ja-JP でない');
    });

    it('front-matter は本文に出ず、title は文書のタイトルになる', async () => {
        const { data } = await exportDocx('---\ntitle: 週報\ntags: [a]\n---\n\n本文\n', {});
        const zip = await JSZip.loadAsync(data);
        const document = (await zip.file('word/document.xml')?.async('string')) ?? '';
        const core = (await zip.file('docProps/core.xml')?.async('string')) ?? '';
        assert.ok(!document.includes('tags'), 'front-matter が本文に出ている');
        assert.ok(core.includes('<dc:title>週報</dc:title>'), core);
    });

    it('生成物に Word が必要とするパーツがそろっている', async () => {
        const { files } = await convert('# A\n\n- b\n');
        for (const part of ['[Content_Types].xml', 'word/document.xml', 'word/numbering.xml', 'word/styles.xml']) {
            assert.ok(files.includes(part), `${part} が無い`);
        }
    });

    it('空の Markdown でも有効な docx を返す', async () => {
        const { files } = await convert('');
        assert.ok(files.includes('word/document.xml'));
    });
});
