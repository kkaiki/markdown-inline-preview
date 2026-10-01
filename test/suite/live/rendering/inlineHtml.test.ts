/**
 * Live モード: インライン HTML（`<span style="…">…</span>` など）の走査と無害化（純関数）。
 *
 * 何を: 許可したタグだけを「タグを隠して中身に装飾を当てる」トークンとして検出し、
 *       style は許可したプロパティだけを残すこと。表のセル用の分割（inlineSegments）にも
 *       同じ情報が載ること。
 * なぜ: 週報などで `<span style="background:…">🟡 承認事項あり</span>` のようなバッジを
 *       書くと、Live モードではタグがそのまま文字で出ていた（表の中でも同じ）。
 *       一方で任意の HTML を通すと webview にスクリプトや画面を覆う要素を持ち込めるため、
 *       タグ・属性・style を許可リストで絞る。
 * どの層で: 走査と無害化は純関数なので jsdom（実 DOM の描画は test/browser 側で確認）。
 */
import * as assert from 'assert';
import { scanSyntaxRanges, type SyntaxRange } from '../../../../src/live/shared/syntaxRanges';
import { inlineSegments } from '../../../../src/live/shared/inlineSegments';
import { sanitizeInlineStyle } from '../../../../src/live/shared/inlineHtml';

function htmlRanges(doc: string): SyntaxRange[] {
    return scanSyntaxRanges(doc).filter((r) => r.kind === 'html');
}

const BADGE =
    '<span style="background:#fff3bf;color:#e67700;padding:2px 8px;border-radius:10px;font-weight:bold;white-space:nowrap">🟡 承認事項あり</span>';

describe('Live モード: インライン HTML の検出', () => {
    it('style 付きの span はトークンスコープで、開き・閉じタグを隠して中身に装飾を当てる', () => {
        const doc = `前 ${BADGE} 後`;
        const [r] = htmlRanges(doc);
        assert.ok(r, 'span が検出されない');
        assert.strictEqual(r.scope, 'token');
        assert.strictEqual(doc.slice(r.markFrom, r.markTo), '🟡 承認事項あり');
        assert.strictEqual(doc.slice(r.revealFrom, r.revealTo), BADGE);
        assert.deepStrictEqual(
            r.hidden.map((h) => doc.slice(h.from, h.to)),
            [BADGE.slice(0, BADGE.indexOf('>') + 1), '</span>']
        );
        assert.strictEqual(r.html?.tag, 'span');
        assert.ok(r.html?.style.includes('color: #e67700'), r.html?.style);
        assert.ok(r.html?.style.includes('white-space: nowrap'), r.html?.style);
    });

    it('属性の無い <b> <mark> <sub> なども検出する', () => {
        for (const tag of ['b', 'i', 'u', 's', 'mark', 'sub', 'sup', 'small', 'kbd', 'strong', 'em']) {
            const [r] = htmlRanges(`x <${tag}>中身</${tag}> y`);
            assert.ok(r, `<${tag}> が検出されない`);
            assert.strictEqual(r.html?.tag, tag);
        }
    });

    it('タグ名の大文字小文字は区別しない', () => {
        const [r] = htmlRanges('<SPAN style="color:red">赤</SPAN>');
        assert.strictEqual(r?.html?.tag, 'span');
    });

    it('同じタグの入れ子は対応する閉じタグまでを1つにする', () => {
        const doc = '<span style="color:red">外<span style="color:blue">内</span>外</span>';
        const rs = htmlRanges(doc);
        assert.strictEqual(rs.length, 2);
        assert.strictEqual(doc.slice(rs[0].markFrom, rs[0].markTo), '外<span style="color:blue">内</span>外');
        assert.strictEqual(doc.slice(rs[1].markFrom, rs[1].markTo), '内');
    });

    it('中身の Markdown 記法も従来どおり検出される', () => {
        const ranges = scanSyntaxRanges('<span style="color:red">**太字**</span>');
        assert.ok(ranges.some((r) => r.kind === 'html'));
        assert.ok(ranges.some((r) => r.kind === 'strong'));
    });

    it('閉じタグが無ければ検出しない（生のまま）', () => {
        assert.deepStrictEqual(htmlRanges('<span style="color:red">閉じていない'), []);
    });

    it('許可していないタグ（script / div / a / img / style など）は検出しない', () => {
        for (const src of [
            '<script>alert(1)</script>',
            '<div>ブロック</div>',
            '<a href="javascript:alert(1)">リンク</a>',
            '<style>body{display:none}</style>',
            '<iframe src="x">x</iframe>'
        ]) {
            assert.deepStrictEqual(htmlRanges(src), [], src);
        }
    });

    it('インラインコードの中のタグは検出しない', () => {
        assert.deepStrictEqual(htmlRanges('`<span style="color:red">x</span>`'), []);
    });

    it('バックスラッシュでエスケープしたタグは検出しない', () => {
        assert.deepStrictEqual(htmlRanges('\\<span>x</span>'), []);
    });

    it('コードフェンスの中のタグは検出しない', () => {
        assert.deepStrictEqual(htmlRanges('```\n<span style="color:red">x</span>\n```\n'), []);
    });

    it('onclick などのイベント属性は無視して、タグとしては検出する', () => {
        const [r] = htmlRanges('<span onclick="alert(1)" style="color:red">x</span>');
        assert.ok(r);
        assert.strictEqual(r.html?.style, 'color: red');
    });
});

describe('Live モード: インライン HTML の style の無害化', () => {
    it('許可したプロパティはそのまま残す', () => {
        assert.strictEqual(
            sanitizeInlineStyle('background:#fff3bf;color:#e67700;font-weight:bold'),
            'background: #fff3bf; color: #e67700; font-weight: bold'
        );
    });

    it('url() や expression() を含む値は捨てる', () => {
        assert.strictEqual(sanitizeInlineStyle('background:url(https://evil/x.png);color:red'), 'color: red');
        assert.strictEqual(sanitizeInlineStyle('color:expression(alert(1))'), '');
        assert.strictEqual(sanitizeInlineStyle('background:javascript:alert(1)'), '');
    });

    it('画面を覆える position などは捨てる', () => {
        assert.strictEqual(
            sanitizeInlineStyle('position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:9999;color:red'),
            'color: red'
        );
    });

    it('プロパティ名の大文字小文字と余分な空白を正規化する', () => {
        assert.strictEqual(sanitizeInlineStyle('  COLOR :  red ;; '), 'color: red');
    });
});

describe('Live モード: 表のセル用の分割（inlineSegments）', () => {
    it('span の中身は html の情報を持ち、タグ文字は出ない', () => {
        const segs = inlineSegments(`状態 ${BADGE}`);
        assert.strictEqual(segs.map((s) => s.text).join(''), '状態 🟡 承認事項あり');
        const badge = segs.find((s) => s.text === '🟡 承認事項あり');
        assert.ok(badge, JSON.stringify(segs));
        assert.strictEqual(badge.html?.length, 1);
        assert.strictEqual(badge.html?.[0].tag, 'span');
        assert.ok(badge.html?.[0].style.includes('background: #fff3bf'));
    });

    it('span の中の太字は span と太字の両方を持つ', () => {
        const segs = inlineSegments('<span style="color:red">**太字**</span>');
        assert.strictEqual(segs.length, 1);
        assert.strictEqual(segs[0].text, '太字');
        assert.strictEqual(segs[0].classes, 'cm-live-strong');
        assert.strictEqual(segs[0].html?.[0].tag, 'span');
    });

    it('許可していないタグは文字のまま残る', () => {
        const segs = inlineSegments('<script>x</script>');
        assert.strictEqual(segs.map((s) => s.text).join(''), '<script>x</script>');
        assert.ok(segs.every((s) => !s.html || s.html.length === 0));
    });
});
