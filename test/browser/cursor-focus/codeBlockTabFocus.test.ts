/**
 * 実ブラウザ回帰テスト: コードブロック内での Tab キー。
 *
 * ユーザー報告「``` の中を編集していると次の見出し(H2)に移動する」の原因調査で判明した
 * バグ: ProseMirror は code_block に Tab を割り当てておらず、素通りするとブラウザ既定の
 * 「次のフォーカス可能要素へ移動」が発動し、コードブロック自身の言語選択 <select> へ
 * DOM フォーカスが飛んでしまう（詳細: docs/specifications/fixes/code-block-tab-focus-leak-fix.md）。
 * ここでは Tab/Shift+Tab がフォーカスを外に漏らさず、タブ挿入/インデント解除として
 * 機能することを検証する。
 *
 * 実行: `npm run test:browser`。ブラウザが無い環境では skip。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openPreview, type PreviewHandle } from '../previewBrowserHarness';

async function focusInfo(handle: PreviewHandle) {
    return handle.page.evaluate(() => {
        /* eslint-disable @typescript-eslint/no-explicit-any */
        const view = (window as any).__view;
        const active = document.activeElement;
        return {
            hasFocus: view ? view.hasFocus() : null,
            activeElementInEditor: active ? view.dom.contains(active) || active === view.dom : null
        };
        /* eslint-enable @typescript-eslint/no-explicit-any */
    });
}

describe('修正確認: コードブロック内 Tab でフォーカスが飛ばない', function () {
    this.timeout(120000);
    let browser: Browser | null = null;
    let h: PreviewHandle | undefined;

    before(async () => { browser = await launchBrowser(); });
    after(async () => { await browser?.close(); });
    afterEach(async () => { if (h) { await h.close(); h = undefined; } });

    it('コードブロック内で Tab キーを押してもフォーカスがエディタ外へ出ない', async function () {
        if (!browser) { this.skip(); return; }
        const md = [
            '# タイトル',
            '',
            '```js',
            'function foo() {',
            'return 1;',
            '}',
            '```',
            '',
            '## 見出し2',
            '',
            '本文'
        ].join('\n');
        h = await openPreview(browser, md, '本文');
        await h.placeCursorAfterText('return 1;');
        await h.press('Tab');
        const after = await focusInfo(h);
        assert.strictEqual(after.activeElementInEditor, true, 'Tab キーでフォーカスがエディタ外へ移動した');
        assert.deepStrictEqual(h.errors, []);
    });

    it('Tab キーでタブ文字が挿入される', async function () {
        if (!browser) { this.skip(); return; }
        const md = ['```js', 'foo();', '```'].join('\n');
        h = await openPreview(browser, md, 'foo();');
        await h.placeCursorAfterText('foo();');
        await h.press('Tab');
        const m = await h.model();
        assert.ok(m.text.includes('foo();\t'), `タブ文字が挿入されていない: ${JSON.stringify(m.text)}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('Shift+Tab で行頭のインデントを1段階解除できる', async function () {
        if (!browser) { this.skip(); return; }
        const md = ['```js', '    indented();', '```'].join('\n');
        h = await openPreview(browser, md, 'indented();');
        await h.placeCursorAfterText('indented();');
        await h.press('Shift+Tab');
        const m = await h.model();
        assert.ok(m.text.includes('indented();'), `テキストが壊れた: ${JSON.stringify(m.text)}`);
        assert.ok(!m.text.includes('    indented();'), `インデントが解除されていない: ${JSON.stringify(m.text)}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('コードブロック外の Tab は既存動作のまま（クラッシュしない）', async function () {
        if (!browser) { this.skip(); return; }
        const md = ['段落テキスト'].join('\n');
        h = await openPreview(browser, md, '段落テキスト');
        await h.placeCursorAfterText('段落テキスト');
        await h.press('Tab');
        assert.deepStrictEqual(h.errors, []);
    });
});
