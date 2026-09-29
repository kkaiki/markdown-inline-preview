/**
 * Marp スライド書き出し（PRO+）の HTML 組み立て（`src/shared/marp/marpHtml.ts`）を固定する。
 *
 * ユーザー決定（2026-09-28）: Marp スライド書き出しは PRO+。@marp-team/marp-core で HTML+CSS を作り、
 * 既存の PDF 書き出しと同じローカル Chrome で印刷する（設計: docs/private/specifications/pro-marp-export.md）。
 * ここでは「どう分割されるか」「用紙の大きさ」「外部へ何も取りに行かないこと」「生 HTML を出さないこと」を守る。
 * 実際の PDF のページ数・寸法は test/browser/live/rendering/marpPdf.test.ts（実 Chrome）で確かめる。
 */
import * as assert from 'assert';
import { buildMarpHtml } from '../../../src/shared/marp/marpHtml';

const FONTS = 'file:///ext/media/fonts/';

function build(markdown: string) {
    return buildMarpHtml(markdown, { katexFontPath: FONTS, title: 'deck' });
}

/** 描画されたスライド（marp-core は 1 枚 = 1 つの <svg data-marpit-svg>）の数。 */
function slideCount(html: string): number {
    return (html.match(/<svg data-marpit-svg/g) ?? []).length;
}

/** http(s) の読み込み先（XML 名前空間の www.w3.org は除く）。 */
function externalUrls(html: string): string[] {
    return (html.match(/https?:\/\/[^\s"')]+/g) ?? []).filter((u) => !u.startsWith('http://www.w3.org/'));
}

describe('Marp スライド書き出し: HTML の組み立て', () => {
    describe('スライドの分け方', () => {
        it('marp: true の文書は、--- で区切った数だけスライドになる', () => {
            const r = build('---\nmarp: true\n---\n\n# 1\n\n本文\n\n---\n\n## 2\n\n---\n\n3 枚目\n');
            assert.strictEqual(r.slideCount, 3);
            assert.strictEqual(slideCount(r.html), 3);
        });

        it('marp: true の文書は、見出しだけでは分けない（Marp 記法どおり）', () => {
            const r = build('---\nmarp: true\n---\n\n# 1\n\n## 2\n');
            assert.strictEqual(r.slideCount, 1);
        });

        it('marp: true が無い文書は、# と ## の見出しごとに 1 枚になる', () => {
            const r = build('# 議事録\n\n参加者\n\n## 議題 1\n\n内容\n\n### 補足\n\n補足\n\n## 議題 2\n\n内容\n');
            assert.strictEqual(r.slideCount, 3);
        });

        it('marp: true が無い文書でも、コードブロックの中の # では分けない', () => {
            const r = build('# 手順\n\n```bash\n# これはコメント\necho hi\n```\n\n## 次\n');
            assert.strictEqual(r.slideCount, 2);
        });

        it('自分で headingDivider を書いた文書は、その指定のまま分ける', () => {
            const r = build('---\nheadingDivider: 3\n---\n\n# 1\n\n## 2\n\n### 3\n');
            assert.strictEqual(r.slideCount, 3);
        });

        it('front-matter が別のキー（tags 等）だけの普通の文書も、見出しごとに分ける', () => {
            const r = build('---\ntags: [memo]\n---\n\n# A\n\n## B\n');
            assert.strictEqual(r.slideCount, 2);
        });
    });

    describe('用紙の大きさ', () => {
        it('既定は 16:9（1280 × 720）で、1 枚 1 ページに印刷する', () => {
            const r = build('# A\n');
            assert.deepStrictEqual({ width: r.width, height: r.height }, { width: 1280, height: 720 });
            assert.ok(r.html.includes('@page { size: 1280px 720px; margin: 0; }'), r.html.slice(0, 200));
            assert.ok(/break-after:\s*page/.test(r.html));
        });

        it('size: 4:3 を書くと 960 × 720 になる（テーマの基底サイズを拾わない）', () => {
            const r = build('---\nmarp: true\nsize: 4:3\n---\n\n# A\n');
            assert.deepStrictEqual({ width: r.width, height: r.height }, { width: 960, height: 720 });
            assert.ok(r.html.includes('@page { size: 960px 720px; margin: 0; }'));
        });
    });

    describe('外部へ何も取りに行かない', () => {
        for (const theme of ['default', 'gaia', 'uncover']) {
            it(`テーマ ${theme} でも、HTML に http(s) の読み込み先が 1 つも無い`, () => {
                const r = build(`---\nmarp: true\ntheme: ${theme}\n---\n\n# 数式 $E=mc^2$ と絵文字 🎉 :smile:\n`);
                assert.deepStrictEqual(externalUrls(r.html), []);
            });
        }

        it('数式のフォントは渡したローカルのフォルダを指す', () => {
            const r = build('# $x^2$\n');
            assert.ok(r.html.includes(`${FONTS}KaTeX_`), 'ローカルの KaTeX フォントを指していない');
        });

        it('絵文字は画像に置き換えず、文字のまま出す（OS の絵文字フォントに任せる）', () => {
            const r = build('# 🎉\n');
            assert.ok(r.html.includes('🎉'));
            assert.ok(!/<img[^>]*emoji/i.test(r.html));
        });
    });

    describe('安全', () => {
        it('生 HTML（<script> など）は出力に含めない', () => {
            const r = build('# A\n\n<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n');
            // 文字として（&lt;script&gt; のように）出るのは構わない。タグとして出てはいけない
            assert.ok(!r.html.includes('<script>alert(1)</script>'));
            assert.ok(!/<img[^>]*onerror/i.test(r.html));
            assert.ok(r.html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), '本文がエスケープされていない');
        });

        it('タイトルの <, &, " はエスケープする', () => {
            const r = buildMarpHtml('# A\n', { katexFontPath: FONTS, title: '<b>&"x' });
            assert.ok(r.html.includes('<title>&lt;b&gt;&amp;&quot;x</title>'), r.html.slice(0, 300));
        });
    });

    describe('そのほか', () => {
        it('スピーカーノート（HTML コメント）はスライドに出さず、ノートとして取り出せる', () => {
            const r = build('# A\n\n<!-- 話すこと -->\n\n## B\n');
            assert.ok(!r.html.includes('話すこと'));
            assert.deepStrictEqual(r.notes, [['話すこと'], []]);
        });

        it('日本語の文書として組む（lang="ja"）', () => {
            assert.ok(build('# A\n').html.startsWith('<!DOCTYPE html>\n<html lang="ja">'));
        });
    });
});
