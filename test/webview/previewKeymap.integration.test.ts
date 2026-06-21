/**
 * previewKeymapPlugin の統合テスト。
 * 実 Milkdown エディタ（jsdom）に対して DOM keydown を送り、
 * handleKeyDown → コマンド実行 → 文書変換 までの一連を検証する。
 */
import './jsdomSetup';
import * as assert from 'assert';
import { CellSelection } from '@milkdown/prose/tables';
import { TextSelection } from '@milkdown/prose/state';

import {
    createPreviewEditor,
    findFirstPosOfType,
    type PreviewEditorHandle
} from './milkdownHarness';

describe('webview統合: Notion風ブロック変換 (Cmd/Ctrl+Opt+数字)', () => {
    let h: PreviewEditorHandle;

    afterEach(() => h?.destroy());

    async function setupParagraph(): Promise<void> {
        h = await createPreviewEditor('hello world\n');
        h.setCursor(findFirstPosOfType(h, 'paragraph'));
    }

    it('Cmd+Opt+1 で段落→見出し(level1)', async () => {
        await setupParagraph();
        const res = h.pressKey({ code: 'Digit1', key: '1', meta: true, alt: true });
        assert.strictEqual(res.defaultPrevented, true, 'preventDefault されるべき');
        assert.ok(h.topLevelTypes().includes('heading'), `heading になっていない: ${h.topLevelTypes().join(", ")}`);
    });

    it('Cmd+Opt+8 で段落→コードブロック', async () => {
        await setupParagraph();
        h.pressKey({ code: 'Digit8', key: '8', meta: true, alt: true });
        assert.ok(h.topLevelTypes().includes('code_block'), `code_block になっていない: ${h.topLevelTypes().join(", ")}`);
    });

    it('Cmd+Opt+5 で段落→箇条書きリスト', async () => {
        await setupParagraph();
        h.pressKey({ code: 'Digit5', key: '5', meta: true, alt: true });
        assert.ok(h.topLevelTypes().includes('bullet_list'), `bullet_list になっていない: ${h.topLevelTypes().join(", ")}`);
    });

    it('Cmd+Opt+6 で段落→番号付きリスト', async () => {
        await setupParagraph();
        h.pressKey({ code: 'Digit6', key: '6', meta: true, alt: true });
        assert.ok(h.topLevelTypes().includes('ordered_list'), `ordered_list になっていない: ${h.topLevelTypes().join(", ")}`);
    });

    it('Cmd+Opt+6 で既存の箇条書き→番号付きへ変換（番号も振り直す）', async () => {
        h = await createPreviewEditor('- one\n- two\n');
        h.setCursor(findFirstPosOfType(h, 'paragraph'));
        const res = h.pressKey({ code: 'Digit6', key: '6', meta: true, alt: true });
        assert.strictEqual(res.defaultPrevented, true);
        assert.ok(h.topLevelTypes().includes('ordered_list'), `ordered_list になっていない: ${h.topLevelTypes().join(", ")}`);
        const labels: string[] = [];
        h.view.state.doc.descendants((n) => {
            if (n.type.name === 'list_item') labels.push(n.attrs.label as string);
        });
        assert.deepStrictEqual(labels, ['1.', '2.'], `番号がずれている: ${JSON.stringify(labels)}`);
    });

    it('Cmd+Opt+5 で既存の番号付き→箇条書きへ変換', async () => {
        h = await createPreviewEditor('1. one\n2. two\n');
        h.setCursor(findFirstPosOfType(h, 'paragraph'));
        h.pressKey({ code: 'Digit5', key: '5', meta: true, alt: true });
        assert.ok(h.topLevelTypes().includes('bullet_list'), `bullet_list になっていない: ${h.topLevelTypes().join(", ")}`);
    });

    it('Cmd+Opt+6 を番号付きリスト内でもう一度 → リスト解除', async () => {
        h = await createPreviewEditor('1. one\n');
        h.setCursor(findFirstPosOfType(h, 'paragraph'));
        h.pressKey({ code: 'Digit6', key: '6', meta: true, alt: true });
        assert.ok(!h.topLevelTypes().includes('ordered_list'), `解除されていない: ${h.topLevelTypes().join(", ")}`);
    });

    it('Cmd+Opt+9 で段落→引用', async () => {
        await setupParagraph();
        h.pressKey({ code: 'Digit9', key: '9', meta: true, alt: true });
        assert.ok(h.topLevelTypes().includes('blockquote'), `blockquote になっていない: ${h.topLevelTypes().join(", ")}`);
    });

    it('Ctrl+Alt+1 (Win/Linux) でも見出しになる', async () => {
        await setupParagraph();
        const res = h.pressKey({ code: 'Digit1', key: '1', ctrl: true, alt: true });
        assert.strictEqual(res.defaultPrevented, true);
        assert.ok(h.topLevelTypes().includes('heading'));
    });

    it('Cmd+Opt+7 (未割り当て) は文書を変えない', async () => {
        await setupParagraph();
        const before = JSON.stringify(h.docJSON());
        const res = h.pressKey({ code: 'Digit7', key: '7', meta: true, alt: true });
        assert.strictEqual(res.defaultPrevented, false, 'preventDefault すべきでない');
        assert.strictEqual(JSON.stringify(h.docJSON()), before, '文書が変化してはいけない');
    });

    it('Opt のみ(Mod なし)では変換されない', async () => {
        await setupParagraph();
        const before = JSON.stringify(h.docJSON());
        h.pressKey({ code: 'Digit1', key: '1', alt: true });
        assert.strictEqual(JSON.stringify(h.docJSON()), before);
    });
});

describe('webview統合: Cmd/Ctrl+A 段階選択', () => {
    let h: PreviewEditorHandle;
    afterEach(() => h?.destroy());

    const TABLE_MD = [
        '| A | B |',
        '| --- | --- |',
        '| one | two |',
        ''
    ].join('\n');

    it('セル内で Cmd+A: 1回目=セル内容 を選択', async () => {
        h = await createPreviewEditor(TABLE_MD);
        // 最初のセル(paragraph)の中身にカーソル
        h.setCursor(findFirstPosOfType(h, 'paragraph'));
        const res = h.pressKey({ code: 'KeyA', key: 'a', meta: true });
        assert.strictEqual(res.defaultPrevented, true);
        const sel = h.view.state.selection;
        assert.ok(sel instanceof TextSelection, 'TextSelection であるべき');
        assert.ok(sel.from < sel.to, 'セル内容が選択されているべき');
    });

    it('セル内容選択済みで再度 Cmd+A: 行全体(CellSelection)へ', async () => {
        h = await createPreviewEditor(TABLE_MD);
        h.setCursor(findFirstPosOfType(h, 'paragraph'));
        h.pressKey({ code: 'KeyA', key: 'a', meta: true }); // 1回目: セル内容
        h.pressKey({ code: 'KeyA', key: 'a', meta: true }); // 2回目: 行全体
        assert.ok(h.view.state.selection instanceof CellSelection, 'CellSelection であるべき');
    });

    it('コードブロック内 Cmd+A: 1回目=ブロック内容を選択', async () => {
        h = await createPreviewEditor('```\nconst a = 1\nconst b = 2\n```\n');
        h.setCursor(findFirstPosOfType(h, 'code_block'));
        const res = h.pressKey({ code: 'KeyA', key: 'a', meta: true });
        assert.strictEqual(res.defaultPrevented, true);
        const sel = h.view.state.selection;
        assert.ok(sel instanceof TextSelection && sel.from < sel.to, 'コード内容が選択されているべき');
    });

    it('通常の段落で Cmd+A: プラグインは処理しない(既定に委ねる)', async () => {
        h = await createPreviewEditor('just a paragraph\n');
        h.setCursor(findFirstPosOfType(h, 'paragraph'));
        const res = h.pressKey({ code: 'KeyA', key: 'a', meta: true });
        // handleSelectAll は false を返す → preventDefault されない
        assert.strictEqual(res.defaultPrevented, false);
    });
});

describe('webview統合: ``` + Enter でコードブロック化', () => {
    let h: PreviewEditorHandle;
    afterEach(() => h?.destroy());

    it('段落 "```js" で Enter → コードブロック', async () => {
        h = await createPreviewEditor('x\n');
        const pos = findFirstPosOfType(h, 'paragraph');
        // 段落の中身を "```js" に置き換える
        const { state } = h.view;
        const para = state.doc.resolve(pos).parent;
        const start = pos;
        const end = pos + para.content.size;
        h.view.dispatch(state.tr.insertText('```js', start, end));
        h.setCursor(h.view.state.doc.resolve(start).parent.content.size + start);

        const res = h.pressKey({ key: 'Enter', code: 'Enter' });
        assert.strictEqual(res.defaultPrevented, true);
        assert.ok(h.topLevelTypes().includes('code_block'), `code_block になっていない: ${h.topLevelTypes().join(", ")}`);
    });
});
