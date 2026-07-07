/**
 * チェックボックス（タスクリスト）項目で Enter を押したときの継続テスト。
 * `- [x]` で改行しても新しい項目は常に未チェック（`- [ ]`）になること。
 * また空項目での Enter でリストを抜ける動作も検証する。
 */
import '../jsdomSetup';
import * as assert from 'assert';
import { serializerCtx } from '@milkdown/kit/core';
import { tightenListSpacing, stripPlaceholderLineBreaks, stripListItemPlaceholderBr } from '../../../src/shared/markdown/lineBreaks';
import { createPreviewEditor, findFirstPosOfType, type PreviewEditorHandle } from '../milkdownHarness';

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

    it('Enter 後の新チェックボックス項目は postChange 後も "[ ] " 構文を保持する', async () => {
        // remark-preserve-empty-line が空タスク項目を "* [ ] <br />" と直列化する。
        // postChange では stripPlaceholderLineBreaks + stripListItemPlaceholderBr を
        // 適用して "* [ ] " に変換し、Raw モードでチェックボックスとして認識できるようにする。
        // この変換がなければ "* [ ]" や "*" になって checkbox syntax が消えてしまう。
        await setupCheckedItem('- [ ] task\n');
        h.pressKey({ key: 'Enter', code: 'Enter' });

        // postChange と同じ変換パイプラインを適用する
        let rawMd = '';
        h.editor.action((ctx) => {
            const serializer = ctx.get(serializerCtx);
            rawMd = serializer(h.view.state.doc);
        });
        const md = stripListItemPlaceholderBr(
            stripPlaceholderLineBreaks(tightenListSpacing(rawMd))
        );

        // GFM チェックボックス syntax "[ ]" が新項目の行に含まれていること
        const checkboxLines = md.split('\n').filter((l) => /\[[ x]\]/.test(l));
        assert.ok(
            checkboxLines.length >= 2,
            `postChange 後も2行以上チェックボックス行があるべき。実際の Markdown: ${JSON.stringify(md)}`
        );

        // 新しい行（2行目）のチェックボックス後にスペースがある（"[ ] " 形式）
        const newLine = checkboxLines[1];
        assert.ok(
            /\[ \]/.test(newLine),
            `新規空チェックボックス行 "${newLine}" に "[ ]" 構文がない。Markdown: ${JSON.stringify(md)}`
        );
    });

    it('空チェックボックスで Enter → リストを抜ける（2回 Enter でリスト離脱）', async () => {
        // 1回目 Enter: task 末尾 → 新しい空チェックボックス項目が作られる。
        // 2回目 Enter: 空項目なのでリストを抜ける（ProseMirror の liftEmptyBlock 相当）。
        // リスト項目が1個になり、かつトップレベルに paragraph が増える。
        await setupCheckedItem('- [ ] task\n');
        h.pressKey({ key: 'Enter', code: 'Enter' });

        // この時点で list_item が2個あるはず
        const statesBefore = checkedStates(h);
        assert.strictEqual(statesBefore.length, 2, `1回目 Enter 後に2項目あるべき: ${JSON.stringify(statesBefore)}`);

        // 2回目 Enter: 空項目のためリストを抜ける
        h.pressKey({ key: 'Enter', code: 'Enter' });

        const statesAfter = checkedStates(h);
        assert.strictEqual(
            statesAfter.length,
            1,
            `2回目 Enter 後は空項目が消えリストに1項目だけ残るべき（実際: ${JSON.stringify(statesAfter)}）`
        );
    });
});
