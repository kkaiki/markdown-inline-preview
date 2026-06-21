/**
 * チェックボックス（タスクリスト）項目で Enter を押したときの継続テスト。
 * `- [x]` で改行しても新しい項目は常に未チェック（`- [ ]`）になること。
 */
import './jsdomSetup';
import * as assert from 'assert';
import { createPreviewEditor, findFirstPosOfType, type PreviewEditorHandle } from './milkdownHarness';

function checkedStates(h: PreviewEditorHandle): Array<boolean | null | undefined> {
    const states: Array<boolean | null | undefined> = [];
    h.view.state.doc.descendants((n) => {
        if (n.type.name === 'list_item') states.push(n.attrs.checked as boolean | null | undefined);
    });
    return states;
}

describe('webview統合: チェックボックスの Enter 継続', () => {
    let h: PreviewEditorHandle;
    afterEach(() => h?.destroy());

    async function setupCheckedItem(md: string): Promise<void> {
        h = await createPreviewEditor(md);
        // 末尾テキストの後ろにカーソルを置く
        let pos = -1;
        h.view.state.doc.descendants((n, p) => { if (n.isText) pos = p + n.nodeSize; });
        h.setCursor(pos);
    }

    it('チェック済み項目で Enter → 新項目は未チェック', async () => {
        await setupCheckedItem('- [x] done\n');
        const res = h.pressKey({ key: 'Enter', code: 'Enter' });
        assert.strictEqual(res.defaultPrevented, true, 'Enter が処理されるべき');
        const states = checkedStates(h);
        assert.strictEqual(states.length, 2, `項目数が想定外: ${JSON.stringify(states)}`);
        assert.strictEqual(states[0], true, '元の項目はチェック済みのまま');
        assert.strictEqual(states[1], false, `新項目は未チェックであるべき: ${JSON.stringify(states)}`);
    });

    it('未チェック項目で Enter → 新項目も未チェック', async () => {
        await setupCheckedItem('- [ ] todo\n');
        h.pressKey({ key: 'Enter', code: 'Enter' });
        const states = checkedStates(h);
        assert.strictEqual(states[1], false, `新項目は未チェック: ${JSON.stringify(states)}`);
    });

    it('通常の箇条書き（タスクでない）には関与しない', async () => {
        h = await createPreviewEditor('- item\n');
        const pos = findFirstPosOfType(h, 'paragraph');
        h.setCursor(h.view.state.doc.resolve(pos).end());
        const before = h.topLevelTypes();
        h.pressKey({ key: 'Enter', code: 'Enter' });
        // タスクでないのでプラグインは preventDefault せず既定に委ねる（doc 構造は壊れない）
        assert.ok(h.topLevelTypes().length >= before.length);
    });
});
