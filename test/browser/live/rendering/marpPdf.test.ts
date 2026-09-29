/**
 * Marp スライド書き出し（PRO+）の HTML を、拡張と同じ手順（ローカル Chrome の --print-to-pdf）で
 * 印刷すると、1 スライド 1 ページ・スライドの大きさの PDF になること（実 Chrome）。
 *
 * ユーザー決定（2026-09-28）: Marp スライド書き出しは PRO+（docs/private/specifications/pro-marp-export.md）。
 * 分割規則や外部通信なしは test/suite/shared/marpHtml.test.ts が固定しており、ここでは
 * 「実際の PDF のページ数と用紙」を見る。PDF はページごとに /MediaBox を持つので、その数と寸法を読む。
 */
import * as assert from 'assert';
import * as path from 'path';
import { buildMarpHtml } from '../../../../src/shared/marp/marpHtml';
import { printHtml } from '../../chromePrint';

const repoRoot = path.resolve(__dirname, '../../../../..');
const FONTS = `file://${path.join(repoRoot, 'media', 'fonts')}/`;

function print(markdown: string) {
    return printHtml(buildMarpHtml(markdown, { katexFontPath: FONTS, title: 'deck' }).html);
}

describe('Marp スライド書き出し: 実際の PDF（実 Chrome）', function () {
    this.timeout(180000);

    it('16:9 のスライドを 3 枚書き出すと、PDF は 3 ページで各ページ 960 × 540 pt になる', function () {
        const pdf = print('---\nmarp: true\n---\n\n# 1\n\n---\n\n# 2\n\n---\n\n# 3\n');
        if (!pdf) { this.skip(); return; }
        assert.deepStrictEqual(pdf.pages, [
            { width: 960, height: 540 }, { width: 960, height: 540 }, { width: 960, height: 540 }
        ]);
    });

    it('size: 4:3 のスライドを書き出すと、PDF の各ページが 720 × 540 pt になる', function () {
        const pdf = print('---\nmarp: true\nsize: 4:3\n---\n\n# 1\n\n---\n\n# 2\n');
        if (!pdf) { this.skip(); return; }
        assert.deepStrictEqual(pdf.pages, [{ width: 720, height: 540 }, { width: 720, height: 540 }]);
    });

    it('見出しが 4 つある普通のメモを書き出すと、PDF は 4 ページになる（最後に空白ページができない）', function () {
        const pdf = print('# 議事録\n\n参加者: 3 名\n\n## 議題 1\n\n- 決定\n\n## 議題 2\n\n表\n\n## 次回\n\n来週\n');
        if (!pdf) { this.skip(); return; }
        assert.strictEqual(pdf.pages.length, 4);
    });
});
