/**
 * Preview 内検索／置換バーの「実反応」統合テスト。
 *
 * previewFindBar は一致を CSS Custom Highlight でハイライトするだけでなく、
 * 置換では一致 DOM レンジを ProseMirror の位置に変換してトランザクションで
 * 書き換える。ここでは実際のエディタに対して Replace / Replace All が
 * ドキュメントを正しく書き換えるかを検証する。
 */
import '../jsdomSetup';
import * as assert from 'assert';

import { PreviewFindBar } from '../../../src/preview/webview/previewFindBar';
import { createPreviewEditor, type PreviewEditorHandle } from '../milkdownHarness';

function need<E extends Element>(selector: string): E {
    const el = document.querySelector<E>(selector);
    if (!el) throw new Error(`element not found: ${selector}`);
    return el;
}

/** バー内の input / button をラベルで引く小道具。 */
function ui() {
    const inputs = document.querySelectorAll<HTMLInputElement>('.preview-find-input');
    const textButtons = document.querySelectorAll<HTMLButtonElement>('.preview-find-text-button');
    return {
        find: inputs[0],
        replace: need<HTMLInputElement>('.preview-replace-input'),
        replaceBtn: textButtons[0],
        replaceAllBtn: textButtons[1],
        count: need<HTMLElement>('.preview-find-count')
    };
}

function type(input: HTMLInputElement, value: string): void {
    input.value = value;
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
}

describe('webview統合: Preview 検索／置換バー — 実置換', () => {
    let h: PreviewEditorHandle;
    let findBar: PreviewFindBar;

    afterEach(() => {
        findBar?.close();
        document.querySelectorAll('.preview-find-bar').forEach((el) => el.remove());
        h?.destroy();
    });

    async function setup(md: string): Promise<void> {
        h = await createPreviewEditor(md);
        findBar = new PreviewFindBar(h.view.dom.parentElement ?? document.body, () => h.view);
        findBar.open(true); // 置換行を展開して開く
    }

    it('Replace All ですべての一致を置換する', async () => {
        await setup('foo bar foo baz foo\n');
        const u = ui();
        type(u.find, 'foo');
        assert.strictEqual(u.count.textContent, '1/3', '3 件一致しているはず');

        type(u.replace, 'qux');
        u.replaceAllBtn.click();

        assert.match(h.serialize(), /qux bar qux baz qux/, 'すべての foo が qux に置換される');
        assert.strictEqual(u.count.textContent, '0/0', '置換後は foo の一致が無い');
    });

    it('Replace は現在の一致だけを置換し、残りは保持する', async () => {
        await setup('cat cat cat\n');
        const u = ui();
        type(u.find, 'cat');
        assert.strictEqual(u.count.textContent, '1/3');

        type(u.replace, 'dog');
        u.replaceBtn.click();

        assert.match(h.serialize(), /dog cat cat/, '先頭の 1 件だけ置換される');
        assert.strictEqual(u.count.textContent, '1/2', '残り 2 件の一致が示される');
    });

    it('置換テキストが空なら一致を削除できる', async () => {
        await setup('keep DROP keep\n');
        const u = ui();
        type(u.find, 'DROP ');
        type(u.replace, '');
        u.replaceAllBtn.click();

        assert.match(h.serialize(), /keep keep/, '一致が削除される');
    });
});
