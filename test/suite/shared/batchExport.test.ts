/**
 * まとめて書き出し（PRO+）の純関数（`src/shared/batchExport/`）を固定する。
 *
 * ユーザー決定（2026-09-28）: まとめて書き出しは PRO+。フォルダ・複数選択の .md を一度に PDF にする／
 * 1 つの PDF（本）に束ねる（設計: docs/private/specifications/pro-batch-export.md）。
 * ここでは「並べ順」「対象の絞り込み」「出力先の計画（上書き・スキップ・別名）」「画像パスの絶対化」
 * 「束ねた HTML（改ページ・目次・id の衝突回避・.md リンクの内部化）」「並列実行と集計」を守る。
 * 実際の印刷（画像が読み込まれる・ページ数）は test/browser/live/rendering/pdfBatch.test.ts（実 Chrome）で見る。
 */
import * as assert from 'assert';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { compareNaturalPath, selectMarkdownFiles } from '../../../src/shared/batchExport/fileOrder';
import { planOutputs } from '../../../src/shared/batchExport/outputPlan';
import { rewriteImageSources } from '../../../src/shared/batchExport/imagePaths';
import { buildMergedPdfHtml } from '../../../src/shared/batchExport/mergedDocument';
import { runPool, summarizeBatchResults } from '../../../src/shared/batchExport/pool';
import { buildPdfBody, buildPdfHtml } from '../../../src/shared/pdfHtml';

const ROOT = path.resolve('/work/docs');
const p = (rel: string) => path.join(ROOT, rel);

describe('まとめて書き出し: 並べ順と対象', () => {
    it('2-intro.md は 10-intro.md より前に並ぶ（自然順）', () => {
        assert.deepStrictEqual(['10-intro.md', '2-intro.md', '1-intro.md'].sort(compareNaturalPath),
            ['1-intro.md', '2-intro.md', '10-intro.md']);
    });

    it('同じフォルダでは、ファイルがサブフォルダより前に並ぶ（README → 各章）', () => {
        assert.deepStrictEqual(['chapter1/a.md', 'README.md', 'appendix.md'].sort(compareNaturalPath),
            ['appendix.md', 'README.md', 'chapter1/a.md']);
    });

    it('大文字小文字だけが違う名前は隣に並ぶ', () => {
        assert.deepStrictEqual(['b.md', 'C.md', 'a.md'].sort(compareNaturalPath), ['a.md', 'b.md', 'C.md']);
    });

    it('.md / .markdown だけを対象にし、重複を除き、自然順に並べる', () => {
        const files = [p('b.md'), p('a.png'), p('10.md'), p('b.md'), p('2.markdown'), p('notes.txt')];
        assert.deepStrictEqual(selectMarkdownFiles(files, ROOT), [p('2.markdown'), p('10.md'), p('b.md')]);
    });

    it('node_modules / .git 配下は含めない', () => {
        const files = [p('a.md'), p('node_modules/pkg/README.md'), p('.git/x.md'), p('sub/.git/y.md')];
        assert.deepStrictEqual(selectMarkdownFiles(files, ROOT), [p('a.md')]);
    });
});

describe('まとめて書き出し: 出力先の計画', () => {
    it('「各ファイルの隣」なら a.md → a.pdf', () => {
        const plan = planOutputs([p('a.md'), p('sub/b.markdown')], { root: ROOT, mode: 'beside', ext: '.pdf', overwrite: 'overwrite', existing: new Set() });
        assert.deepStrictEqual(plan.map((x) => [x.out, x.action]), [[p('a.pdf'), 'write'], [p('sub/b.pdf'), 'write']]);
    });

    it('「フォルダを選ぶ」なら元のフォルダ構成を保って置く（sub/b.md → <出力先>/sub/b.pdf）', () => {
        const out = path.resolve('/out');
        const plan = planOutputs([p('a.md'), p('sub/b.md')], { root: ROOT, mode: 'folder', outDir: out, ext: '.pdf', overwrite: 'overwrite', existing: new Set() });
        assert.deepStrictEqual(plan.map((x) => x.out), [path.join(out, 'a.pdf'), path.join(out, 'sub/b.pdf')]);
    });

    it('既存があり「スキップ」なら skip、「上書き」なら write のまま', () => {
        const existing = new Set([p('a.pdf')]);
        assert.strictEqual(planOutputs([p('a.md')], { root: ROOT, mode: 'beside', ext: '.pdf', overwrite: 'skip', existing })[0].action, 'skip');
        assert.strictEqual(planOutputs([p('a.md')], { root: ROOT, mode: 'beside', ext: '.pdf', overwrite: 'overwrite', existing })[0].action, 'write');
    });

    it('既存があり「別名」なら a (2).pdf、それもあれば a (3).pdf', () => {
        const existing = new Set([p('a.pdf'), p('a (2).pdf')]);
        const plan = planOutputs([p('a.md')], { root: ROOT, mode: 'beside', ext: '.pdf', overwrite: 'rename', existing });
        assert.deepStrictEqual([plan[0].out, plan[0].action], [p('a (3).pdf'), 'write']);
    });

    it('同じバッチの a.md と a.markdown は、上書き方針に関係なく別名になる', () => {
        const plan = planOutputs([p('a.md'), p('a.markdown')], { root: ROOT, mode: 'beside', ext: '.pdf', overwrite: 'overwrite', existing: new Set() });
        assert.deepStrictEqual(plan.map((x) => x.out), [p('a.pdf'), p('a (2).pdf')]);
    });
});

describe('まとめて書き出し: 画像パスを file:// の絶対 URL にする', () => {
    const base = path.resolve('/work/docs/chapter1');
    const url = (abs: string) => pathToFileURL(abs).href;
    const img = (src: string) => rewriteImageSources(`<p><img src="${src}" alt="x"></p>`, base);

    it('相対パス（./・../・無印）は文書のフォルダ基準の file:// になる', () => {
        assert.ok(img('img/a.png').includes(`src="${url(path.join(base, 'img/a.png'))}"`));
        assert.ok(img('./img/a.png').includes(`src="${url(path.join(base, 'img/a.png'))}"`));
        assert.ok(img('../icon.png').includes(`src="${url(path.resolve(base, '../icon.png'))}"`));
    });

    it('marked がエンコードした空白や日本語は二重にエンコードしない', () => {
        assert.ok(img('assets/lists%20shot.png').includes(`src="${url(path.join(base, 'assets/lists shot.png'))}"`));
        assert.ok(img('画像/a b.png').includes(`src="${url(path.join(base, '画像/a b.png'))}"`));
    });

    it('クエリ・フラグメントは落とし、&amp; は & に戻してから変換する', () => {
        assert.ok(img('a.png?v=1#x').includes(`src="${url(path.join(base, 'a.png'))}"`));
        assert.ok(img('x&amp;y.png').includes(`src="${url(path.join(base, 'x&y.png'))}"`));
    });

    it('http(s)・data・file・#・// はそのまま', () => {
        for (const src of ['https://e.com/a.png', 'http://e.com/a.png', 'data:image/png;base64,AA', 'file:///a.png', '#x', '//cdn/a.png']) {
            assert.ok(img(src).includes(`src="${src}"`), src);
        }
    });

    it('生 HTML の <img> も同じように書き換える', () => {
        const html = rewriteImageSources('<p><img width="20" src=\'../icon.png\'></p>', base);
        assert.ok(html.includes(`src='${url(path.resolve(base, '../icon.png'))}'`), html);
    });
});

describe('まとめて書き出し: 1 つの PDF に束ねる HTML', () => {
    const docs = [
        { path: p('README.md'), markdown: '---\ntags: [x]\n---\n\n# はじめに\n\n## 目的\n\n[第1章](chapter1/intro.md) と [外](other/none.md)\n' },
        { path: p('chapter1/intro.md'), markdown: '## 目的\n\n本文\n\n![図](img/a.png)\n' }
    ];
    const html = buildMergedPdfHtml(docs, 'body{}', { title: '本', tocTitle: '目次', credit: false });

    it('ファイルごとに section で包み、2 本目以降は改ページする', () => {
        assert.strictEqual((html.match(/<section class="ipreview-doc"/g) ?? []).length, 2);
        assert.ok(/\.ipreview-doc \+ \.ipreview-doc \{[^}]*break-before: page/.test(html));
    });

    it('別ファイルの同じ見出しでも id が衝突しない', () => {
        const ids = [...html.matchAll(/<h2 id="([^"]+)">目的<\/h2>/g)].map((m) => m[1]);
        assert.strictEqual(ids.length, 2);
        assert.notStrictEqual(ids[0], ids[1]);
    });

    it('目次の 1 段目はファイルの最初の h1（無ければファイル名）', () => {
        const toc = /<nav class="ipreview-toc ipreview-book-toc">([\s\S]*?)<\/nav>/.exec(html)?.[1] ?? '';
        const top = [...toc.matchAll(/<li class="toc-file"><a href="#([^"]+)">([^<]+)<\/a>/g)].map((m) => m[2]);
        assert.deepStrictEqual(top, ['はじめに', 'intro']);
        assert.ok(toc.includes('目次'));
    });

    it('束ねたファイルへの .md リンクは PDF 内のアンカーになり、束ねていないファイルへのリンクは変わらない', () => {
        assert.ok(/<a href="#doc-2">第1章<\/a>/.test(html), html.slice(html.indexOf('第1章') - 80, html.indexOf('第1章') + 10));
        assert.ok(html.includes('href="other/none.md"'));
    });

    it('画像は各ファイルのフォルダ基準で file:// になる', () => {
        assert.ok(html.includes(`src="${pathToFileURL(p('chapter1/img/a.png')).href}"`));
    });

    it('front-matter は出力に含まれない', () => {
        assert.ok(!html.includes('tags: [x]'));
    });

    it('credit: true を渡したときだけクレジット行が入る（判定は呼び出し側の shouldIncludeCredit に一本化）', () => {
        assert.ok(!html.includes('ipreview-credit'));
        assert.ok(buildMergedPdfHtml(docs, '', { title: '本', tocTitle: '目次', credit: true }).includes('ipreview-credit'));
    });

    it('本文の組み立てを切り出しても、単体の PDF 用 HTML は今までと同じ', () => {
        const md = '# A\n\n- [x] b\n';
        assert.ok(buildPdfHtml(md, '', { credit: false }).includes(buildPdfBody(md)));
    });
});

describe('まとめて書き出し: 並列実行と集計', () => {
    it('同時に動く仕事は並列数を超えない', async () => {
        let running = 0;
        let peak = 0;
        await runPool([1, 2, 3, 4, 5], 2, async () => {
            running++;
            peak = Math.max(peak, running);
            await new Promise((r) => setTimeout(r, 5));
            running--;
        }, () => false);
        assert.strictEqual(peak, 2);
    });

    it('途中の 1 件が失敗しても残りは実行され、結果は入力順に並ぶ', async () => {
        const results = await runPool(['a', 'b', 'c'], 1, (x) =>
            x === 'b' ? Promise.reject(new Error('壊れている')) : Promise.resolve(x.toUpperCase()), () => false);
        assert.deepStrictEqual(results, [
            { status: 'done', value: 'A' },
            { status: 'failed', error: '壊れている' },
            { status: 'done', value: 'C' }
        ]);
    });

    it('キャンセル後は新しい仕事を始めない（実行中の仕事の結果は残る）', async () => {
        let cancelled = false;
        const results = await runPool([1, 2, 3], 1, (x) => {
            if (x === 1) cancelled = true;
            return Promise.resolve(x);
        }, () => cancelled);
        assert.deepStrictEqual(results.map((r) => r.status), ['done', 'cancelled', 'cancelled']);
    });

    it('成功・失敗・スキップ・キャンセルの件数を数える', () => {
        assert.deepStrictEqual(summarizeBatchResults([
            { status: 'done', value: 1 }, { status: 'failed', error: 'x' }, { status: 'skipped' }, { status: 'cancelled' }, { status: 'done', value: 2 }
        ]), { total: 5, done: 2, failed: 1, skipped: 1, cancelled: 1 });
    });
});
