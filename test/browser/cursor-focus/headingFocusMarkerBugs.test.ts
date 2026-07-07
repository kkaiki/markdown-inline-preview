/**
 * 実ブラウザ回帰テスト: 見出し行頭マーカー（`## `）の focusSyntaxPlugin 挙動の不具合。
 *
 * ## テスト対象バグ
 *
 * 1. **フォーカス時と非フォーカス時で見出し行の描画幅が変わる**
 *    非フォーカス時は `## ` を CSS の `::before`（疑似要素）で表示し、フォーカス時は
 *    blockPrefixEditPlugin が実テキストとして `## ` を挿入する。2つの描画経路が異なる
 *    ため、同じ見出しでも状態によって行の実測幅が変わってしまう。
 *
 * 2. **Cmd+A（全選択）で見出しの `## ` だけが選択範囲に含まれない**
 *    `::before` の内容は DOM テキストノードではないため、ブラウザのネイティブ選択
 *    （Selection/Range API）に本質的に含まれない。全選択のハイライトが `## ` の部分にだけ
 *    かからず、視覚的に選択範囲から除外されて見える。
 *
 * 実行: `npm run test:browser`。ブラウザが無い環境では skip。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openPreview, type PreviewHandle } from '../previewBrowserHarness';

describe('実ブラウザ: 見出し行頭マーカー（## ）の focusSyntaxPlugin バグ回帰', function () {
    this.timeout(120000);

    let browser: Browser | null = null;
    let h: PreviewHandle | undefined;

    before(async () => { browser = await launchBrowser(); });
    after(async function () {
        this.timeout(60000);
        await Promise.race([
            browser?.close(),
            new Promise<void>(resolve => setTimeout(resolve, 55000))
        ]);
    });
    afterEach(async () => { if (h) { await h.close(); h = undefined; } });

    it('Bug1: 見出し行にフォーカスがある/ない状態で見出しの描画幅が変わらない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '## 未決定事項\n\n段落テキスト\n', '段落テキスト');

        // 非フォーカス状態（別ブロックにカーソル）での見出し要素の幅を計測。
        await h.placeCursorAfterText('段落テキスト');
        await h.page.waitForTimeout(200);
        const unfocusedWidth = await h.page.evaluate(() => {
            const heading = document.querySelector('.milkdown h2');
            return heading ? heading.getBoundingClientRect().width : null;
        });

        // フォーカス状態（見出し内にカーソル）での幅を計測。
        await h.placeCursorAfterText('未決定事項');
        await h.page.waitForTimeout(200);
        const focusedWidth = await h.page.evaluate(() => {
            const heading = document.querySelector('.milkdown h2');
            return heading ? heading.getBoundingClientRect().width : null;
        });

        assert.ok(unfocusedWidth !== null, '非フォーカス時の見出し要素が見つからない');
        assert.ok(focusedWidth !== null, 'フォーカス時の見出し要素が見つからない');
        assert.strictEqual(
            focusedWidth,
            unfocusedWidth,
            `フォーカスの有無で見出しの幅が変わった: unfocused=${unfocusedWidth}px, focused=${focusedWidth}px`
        );
        assert.deepStrictEqual(h.errors, []);
    });

    it('Bug2: Cmd+A（全選択）後、見出しの "## " がネイティブ選択範囲に含まれる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '## 未決定事項\n\n段落テキスト\n', '段落テキスト');

        // 見出しにカーソルを置いてから全選択する（マーカーが見えている状態を作る）。
        await h.placeCursorAfterText('未決定事項');
        await h.page.waitForTimeout(200);
        await h.press('Meta+a');
        await h.page.waitForTimeout(150);

        const info = await h.page.evaluate(() => {
            const heading = document.querySelector('.milkdown h2');
            if (!heading) return { found: false as const };
            const style = getComputedStyle(heading, '::before');
            const prefixText = style.content && style.content !== 'none' ? style.content.replace(/^"|"$/g, '') : '';
            const sel = window.getSelection();
            const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
            // 疑似要素は Range に本質的に含まれない。見出し要素自体が選択範囲に
            // intersect しているか（intersectsNode）で「本文としては選択されているか」を見る。
            const headingIntersects = range ? range.intersectsNode(heading) : false;
            return { found: true as const, prefixText, headingIntersects, selectionText: sel ? sel.toString() : '' };
        });

        assert.ok(info.found, '見出し要素が見つからない');
        if (info.found) {
            assert.ok(info.headingIntersects, '全選択の範囲に見出し要素自体が含まれていない');
            // "## " がプレフィックスとして今も CSS 疑似要素で表示されている場合、
            // それは DOM テキストではないため選択(Range/Selection)に含まれ得ない。
            // 修正後は "## " が実 DOM テキスト(ウィジェット)になり、疑似要素は使われなくなる。
            assert.strictEqual(
                info.prefixText,
                '',
                `"## " が今も CSS ::before 疑似要素として描画されている（選択に含まれない）: content="${info.prefixText}"`
            );
        }
        assert.deepStrictEqual(h.errors, []);
    });
});
