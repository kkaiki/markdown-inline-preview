/**
 * リスト項目での Enter（継続・離脱）の統合テスト。
 *
 * 日常操作の回帰防止:
 *  - 箇条書き項目末尾の Enter → 新しい箇条書き項目
 *  - 番号付き項目末尾の Enter → 次の番号の項目
 *  - 空項目での Enter → リストを抜けて段落
 *  - 項目途中での Enter → カーソル位置で項目分割
 */
import '../jsdomSetup';
import * as assert from 'assert';

import {
    createPreviewEditor,
    findFirstPosOfType,
    type PreviewEditorHandle
} from '../milkdownHarness';

function listItemCount(h: PreviewEditorHandle): number {
    let n = 0;
    h.view.state.doc.descendants((node) => { if (node.type.name === 'list_item') n++; });
    return n;
}

function topTypes(h: PreviewEditorHandle): string[] {
    return h.topLevelTypes();
}

/** 末尾テキストの直後にカーソルを置く。 */
function cursorAtLastTextEnd(h: PreviewEditorHandle): void {
    let pos = -1;
    h.view.state.doc.descendants((n, p) => { if (n.isText) pos = p + n.nodeSize; });
    h.setCursor(pos);
}

/** 各 list_item の textContent を配列で返す。 */
function listItemTexts(h: PreviewEditorHandle): string[] {
    const texts: string[] = [];
    h.view.state.doc.descendants((node) => {
        if (node.type.name === 'list_item') texts.push(node.textContent);
    });
    return texts;
}

describe('webview統合: リスト項目での Enter', () => {
    let h: PreviewEditorHandle;
    afterEach(() => h?.destroy());

    it('箇条書き項目末尾で Enter → 項目が1つ増える', async () => {
        h = await createPreviewEditor('- one\n');
        cursorAtLastTextEnd(h);
        const before = listItemCount(h);
        h.pressKey({ key: 'Enter', code: 'Enter' });
        assert.strictEqual(listItemCount(h), before + 1, '箇条書き項目が増えていない');
        assert.ok(topTypes(h).includes('bullet_list'), 'リストのままであるべき');
    });

    it('番号付き項目末尾で Enter → 項目が増えリストを維持', async () => {
        h = await createPreviewEditor('1. one\n');
        cursorAtLastTextEnd(h);
        const before = listItemCount(h);
        h.pressKey({ key: 'Enter', code: 'Enter' });
        assert.strictEqual(listItemCount(h), before + 1, '番号付き項目が増えていない');
        assert.ok(topTypes(h).includes('ordered_list'), '番号付きリストのままであるべき');
    });

    it('項目途中で Enter → カーソル位置で2項目に分割される', async () => {
        h = await createPreviewEditor('- helloworld\n');
        // "hello|world"
        let textPos = -1;
        h.view.state.doc.descendants((n, p) => {
            if (textPos < 0 && n.isText && n.text === 'helloworld') { textPos = p + 5; return false; }
            return true;
        });
        h.setCursor(textPos);
        h.pressKey({ key: 'Enter', code: 'Enter' });
        assert.deepStrictEqual(listItemTexts(h), ['hello', 'world'], '分割位置が想定外');
    });

    it('空の箇条書き項目で Enter → リストを抜けて段落になる', async () => {
        // 1回目: "one" 末尾 → 空項目が増える
        h = await createPreviewEditor('- one\n');
        cursorAtLastTextEnd(h);
        h.pressKey({ key: 'Enter', code: 'Enter' });
        assert.strictEqual(listItemCount(h), 2, '前提: 空項目が作られている');
        // 2回目: 空項目 → リスト離脱
        h.pressKey({ key: 'Enter', code: 'Enter' });
        assert.strictEqual(listItemCount(h), 1, '空項目が消えてリストから抜けるべき');
        assert.ok(topTypes(h).includes('paragraph'), 'リスト外の段落ができるべき');
    });

    it('空の番号付き項目で Enter → リストを抜けて段落になる', async () => {
        h = await createPreviewEditor('1. one\n');
        cursorAtLastTextEnd(h);
        h.pressKey({ key: 'Enter', code: 'Enter' });
        assert.strictEqual(listItemCount(h), 2, '前提: 空項目が作られている');
        h.pressKey({ key: 'Enter', code: 'Enter' });
        assert.strictEqual(listItemCount(h), 1, '空項目が消えてリストから抜けるべき');
        assert.ok(topTypes(h).includes('paragraph'), 'リスト外の段落ができるべき');
    });
});
