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
import { previewSelectAllApplies, handleSelectAllCapture, handleSelectAll } from '../../src/preview/webview/previewKeymapPlugin';
import { classifyPreviewShortcut } from '../../src/shared/preview/previewShortcuts';

/** doc 内の段落の「中身の先頭位置」を順に返す。 */
function paragraphContentStarts(h: PreviewEditorHandle): number[] {
    const positions: number[] = [];
    h.view.state.doc.descendants((node, pos) => {
        if (node.type.name === 'paragraph') positions.push(pos + 1);
        return true;
    });
    return positions;
}

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

    it('セル内容選択済みで再度 Cmd+A: 行全体(CellSelection の行選択)へ', async () => {
        h = await createPreviewEditor(TABLE_MD);
        h.setCursor(findFirstPosOfType(h, 'paragraph'));
        h.pressKey({ code: 'KeyA', key: 'a', meta: true }); // 1回目: セル内容
        h.pressKey({ code: 'KeyA', key: 'a', meta: true }); // 2回目: 行全体
        const sel = h.view.state.selection;
        assert.ok(sel instanceof CellSelection, 'CellSelection であるべき');
        // 「行」止まりであること（誤って表全体＝列も跨いだ選択になっていない）を保証する。
        assert.strictEqual(sel.isRowSelection(), true, '行選択であるべき');
        assert.strictEqual(sel.isColSelection(), false, 'まだ表全体であってはいけない');
    });

    it('行選択済みで再度 Cmd+A: 表全体(行かつ列)へ進み、セルへ巻き戻らない', async () => {
        h = await createPreviewEditor(TABLE_MD);
        h.setCursor(findFirstPosOfType(h, 'paragraph'));
        h.pressKey({ code: 'KeyA', key: 'a', meta: true }); // 1回目: セル内容
        h.pressKey({ code: 'KeyA', key: 'a', meta: true }); // 2回目: 行全体
        h.pressKey({ code: 'KeyA', key: 'a', meta: true }); // 3回目: 表全体
        const sel = h.view.state.selection;
        assert.ok(sel instanceof CellSelection, '表全体も CellSelection');
        assert.strictEqual(sel.isRowSelection() && sel.isColSelection(), true, '表全体（行かつ列）であるべき');
    });

    it('表全体の次（4回目）で文書全体になり、5回目は何もしない', async () => {
        h = await createPreviewEditor(TABLE_MD);
        h.setCursor(findFirstPosOfType(h, 'paragraph'));
        h.pressKey({ code: 'KeyA', key: 'a', meta: true }); // セル内容
        h.pressKey({ code: 'KeyA', key: 'a', meta: true }); // 行全体
        h.pressKey({ code: 'KeyA', key: 'a', meta: true }); // 表全体
        const res4 = h.pressKey({ code: 'KeyA', key: 'a', meta: true }); // 4回目: 文書全体
        assert.strictEqual(res4.defaultPrevented, true, '4回目は文書全体を選ぶ(native 任せにしない)');
        const sel = h.view.state.selection;
        assert.strictEqual(sel.from, 0, '文書先頭から');
        assert.strictEqual(sel.to, h.view.state.doc.content.size, '文書末尾まで');
        const res5 = h.pressKey({ code: 'KeyA', key: 'a', meta: true }); // 5回目
        assert.strictEqual(res5.defaultPrevented, false, '文書全体まで来たら以降は何もしない');
    });

    // capture フェーズ（milkdownApp）の native Select All 抑止判定が、実際にプラグインが
    // 段階選択を行う各段階（preventDefault される段階）と一致することを保証する。
    // ここがズレると、抑止したのに選択が変わらない/変わったのに抑止されない不整合になる。
    it('previewSelectAllApplies が各段階の preventDefault と一致する', async () => {
        h = await createPreviewEditor(TABLE_MD);
        h.setCursor(findFirstPosOfType(h, 'paragraph'));
        for (let i = 1; i <= 4; i++) {
            const applies = previewSelectAllApplies(h.view);
            const res = h.pressKey({ code: 'KeyA', key: 'a', meta: true });
            assert.strictEqual(
                applies,
                res.defaultPrevented,
                `${i}回目: applies(${applies}) と preventDefault(${res.defaultPrevented}) が不一致`
            );
        }
    });

    it('コードブロック内 Cmd+A: 1回目=ブロック内容を選択', async () => {
        h = await createPreviewEditor('```\nconst a = 1\nconst b = 2\n```\n');
        h.setCursor(findFirstPosOfType(h, 'code_block'));
        const res = h.pressKey({ code: 'KeyA', key: 'a', meta: true });
        assert.strictEqual(res.defaultPrevented, true);
        const sel = h.view.state.selection;
        assert.ok(sel instanceof TextSelection && sel.from < sel.to, 'コード内容が選択されているべき');
    });

    it('通常の段落で Cmd+A: 1回目=その行(段落)全体を選択', async () => {
        h = await createPreviewEditor('just a paragraph\n');
        const pos = findFirstPosOfType(h, 'paragraph');
        h.setCursor(pos);
        const res = h.pressKey({ code: 'KeyA', key: 'a', meta: true });
        assert.strictEqual(res.defaultPrevented, true, '1回目は preventDefault されるべき');
        const sel = h.view.state.selection;
        assert.ok(sel instanceof TextSelection, 'TextSelection であるべき');
        const $pos = h.view.state.doc.resolve(pos);
        assert.strictEqual(sel.from, $pos.start(), '行頭から選択されているべき');
        assert.strictEqual(sel.to, $pos.end(), '行末まで選択されているべき');
    });

    it('段落の行全体を選択済みで再度 Cmd+A: 文書全体になる', async () => {
        h = await createPreviewEditor('just a paragraph\n');
        h.setCursor(findFirstPosOfType(h, 'paragraph'));
        h.pressKey({ code: 'KeyA', key: 'a', meta: true }); // 1回目: 行全体
        const res = h.pressKey({ code: 'KeyA', key: 'a', meta: true }); // 2回目: 文書全体
        assert.strictEqual(res.defaultPrevented, true, '2回目も処理する(native 任せにしない)');
        const sel = h.view.state.selection;
        assert.strictEqual(sel.from, 0);
        assert.strictEqual(sel.to, h.view.state.doc.content.size);
    });

    it('見出しでも Cmd+A: 1回目=その行(見出し)全体を選択', async () => {
        h = await createPreviewEditor('# Title here\n');
        const pos = findFirstPosOfType(h, 'heading');
        h.setCursor(pos);
        const res = h.pressKey({ code: 'KeyA', key: 'a', meta: true });
        assert.strictEqual(res.defaultPrevented, true);
        const sel = h.view.state.selection;
        assert.ok(sel instanceof TextSelection && sel.from < sel.to, '見出しの中身が選択されているべき');
    });

    it('通常の段落でも previewSelectAllApplies が各段階の preventDefault と一致する', async () => {
        h = await createPreviewEditor('just a paragraph\n');
        h.setCursor(findFirstPosOfType(h, 'paragraph'));
        for (let i = 1; i <= 2; i++) {
            const applies = previewSelectAllApplies(h.view);
            const res = h.pressKey({ code: 'KeyA', key: 'a', meta: true });
            assert.strictEqual(
                applies,
                res.defaultPrevented,
                `${i}回目: applies(${applies}) と preventDefault(${res.defaultPrevented}) が不一致`
            );
        }
    });
});

// milkdownApp.ts の capture フェーズ keydown リスナを「実際のイベント伝播」で再現して、
// handleSelectAllCapture（= 実コードが呼ぶ関数）の挙動を検証する。
// 上の「Cmd/Ctrl+A 段階選択」群が plugin の handleKeyDown 経路（view.dom へ直接 keydown）を
// 検証するのに対し、こちらは document の capture リスナが
//   1. native の全選択を抑止する preventDefault を行うこと
//   2. stopPropagation で plugin に流さず「1 押下＝1 段階」に保つこと（二重発火防止）
//   3. 最終段階で文書全体（AllSelection）を選び、その後（文書全体まで来たら）は抑止しないこと
//      （以前は native の全選択に委ねていたが webview で不安定だったため明示選択にした）
// を、実際の document(capture) → view.dom(plugin, bubble) という伝播経路で担保する。
// （かつて capture が dispatch を plugin 任せにして native に負け、表で全選択されるバグがあった。）
describe('webview統合: Cmd/Ctrl+A capture ハンドラ（milkdownApp 相当）', () => {
    let h: PreviewEditorHandle;
    let detach: (() => void) | null = null;

    afterEach(() => {
        detach?.();
        detach = null;
        h?.destroy();
    });

    const TABLE_MD = ['| A | B |', '| --- | --- |', '| one | two |', ''].join('\n');

    /** milkdownApp.ts と同じ配線で document の capture リスナを張る。 */
    function attachCaptureHandler(handle: PreviewEditorHandle): void {
        const handler = (event: KeyboardEvent): void => {
            if (classifyPreviewShortcut(event)?.kind !== 'selectAll') return;
            handleSelectAllCapture(handle.view, handle.ctx, event);
        };
        document.addEventListener('keydown', handler, true);
        detach = () => document.removeEventListener('keydown', handler, true);
    }

    /** view.dom へ bubbles 付き keydown を送る（capture: document → target: view.dom と伝播）。 */
    function dispatchCmdA(handle: PreviewEditorHandle): KeyboardEvent {
        const event = new window.KeyboardEvent('keydown', {
            key: 'a',
            code: 'KeyA',
            metaKey: true,
            bubbles: true,
            cancelable: true
        });
        handle.view.dom.dispatchEvent(event);
        return event;
    }

    it('capture が native を抑止し、1 押下で 1 段階だけ進む（plugin と二重発火しない）', async () => {
        h = await createPreviewEditor(TABLE_MD);
        h.setCursor(findFirstPosOfType(h, 'paragraph'));
        h.view.focus();
        attachCaptureHandler(h);

        const event = dispatchCmdA(h);

        assert.strictEqual(event.defaultPrevented, true, 'native の全選択を抑止するため preventDefault されるべき');
        const sel = h.view.state.selection;
        // capture が stopPropagation していれば plugin の handleKeyDown は走らないので、
        // 1 押下では段階1（セル内容＝TextSelection）止まり。stopPropagation を忘れると
        // plugin も handleSelectAll を呼び、段階2（行＝CellSelection）まで進んでしまう。
        assert.ok(sel instanceof TextSelection, '段階1（セル内容）の TextSelection であるべき');
        assert.ok(!(sel instanceof CellSelection), '二重発火で行選択(CellSelection)まで進んではいけない');
        assert.ok(sel.from < sel.to, 'セル内容が選択されているべき');
    });

    it('capture でも 1 押下ごとに セル内容→行→表 と 1 段階ずつ進む', async () => {
        h = await createPreviewEditor(TABLE_MD);
        h.setCursor(findFirstPosOfType(h, 'paragraph'));
        h.view.focus();
        attachCaptureHandler(h);

        dispatchCmdA(h); // 1: セル内容
        assert.ok(h.view.state.selection instanceof TextSelection, '1 回目はセル内容');

        dispatchCmdA(h); // 2: 行
        const rowSel = h.view.state.selection;
        assert.ok(rowSel instanceof CellSelection && rowSel.isRowSelection() && !rowSel.isColSelection(), '2 回目は行選択');

        dispatchCmdA(h); // 3: 表全体
        const tableSel = h.view.state.selection;
        assert.ok(
            tableSel instanceof CellSelection && tableSel.isRowSelection() && tableSel.isColSelection(),
            '3 回目は表全体'
        );
    });

    it('表全体の次（4回目）で文書全体になり、5回目は capture が抑止しない', async () => {
        h = await createPreviewEditor(TABLE_MD);
        h.setCursor(findFirstPosOfType(h, 'paragraph'));
        h.view.focus();
        attachCaptureHandler(h);

        dispatchCmdA(h); // セル内容
        dispatchCmdA(h); // 行
        dispatchCmdA(h); // 表全体
        const fourth = dispatchCmdA(h); // 4 回目: 文書全体
        assert.strictEqual(fourth.defaultPrevented, true, '4 回目は文書全体を選ぶので capture が抑止する');
        const sel = h.view.state.selection;
        assert.strictEqual(sel.from, 0);
        assert.strictEqual(sel.to, h.view.state.doc.content.size);

        const fifth = dispatchCmdA(h); // 5 回目: もう広げない
        assert.strictEqual(fifth.defaultPrevented, false, '文書全体まで来たら capture は抑止しない');
    });

    // フォーカスガードは handleSelectAllCapture を直接呼んで検証する（DOM 伝播経由だと
    // plugin の handleKeyDown はフォーカス非依存で発火してしまい、ガードの検証にならないため）。
    it('フォーカスが無いときは何もしない（preventDefault/stopPropagation せず false）', async () => {
        h = await createPreviewEditor(TABLE_MD);
        h.setCursor(findFirstPosOfType(h, 'paragraph'));
        h.view.dom.blur();
        assert.strictEqual(h.view.hasFocus(), false, '前提: フォーカスが無い状態');

        let prevented = false;
        let stopped = false;
        const handled = handleSelectAllCapture(h.view, h.ctx, {
            preventDefault: () => { prevented = true; },
            stopPropagation: () => { stopped = true; }
        });

        assert.strictEqual(handled, false, 'フォーカスが無ければ false');
        assert.strictEqual(prevented, false, 'preventDefault してはいけない');
        assert.strictEqual(stopped, false, 'stopPropagation してはいけない');
    });
});

describe('webview統合: Cmd/Ctrl+A 2回で文書全体になる（native 任せにしない）', () => {
    let h: PreviewEditorHandle;
    afterEach(() => h?.destroy());

    function isWholeDoc(h: PreviewEditorHandle): boolean {
        const sel = h.view.state.selection;
        return sel.from === 0 && sel.to === h.view.state.doc.content.size;
    }

    it('段落: 1回目=その行, 2回目=文書全体', async () => {
        h = await createPreviewEditor('first para\n\nSECOND para\n\nthird para\n');
        const starts = paragraphContentStarts(h);
        assert.ok(starts.length >= 3, `段落が3つ未満: ${starts.length}`);
        // 2 番目の段落にカーソル
        h.setCursor(starts[1]);

        // 1回目: その行（2番目の段落）だけ
        handleSelectAll(h.view, h.ctx);
        const afterFirst = h.view.state.selection;
        assert.ok(!isWholeDoc(h), '1回目で文書全体になってはいけない（行のみ）');
        assert.ok(afterFirst.from > 0, '1回目は2番目の段落の行を選ぶ（先頭ではない）');

        // 2回目: 文書全体
        handleSelectAll(h.view, h.ctx);
        assert.ok(isWholeDoc(h), '2回目で文書全体になっていない（native 任せだと崩れる）');
    });

    it('段落: 3回目も文書全体のまま（先頭行へ巻き戻らない）', async () => {
        h = await createPreviewEditor('first para\n\nSECOND para\n\nthird para\n');
        const starts = paragraphContentStarts(h);
        h.setCursor(starts[1]);
        handleSelectAll(h.view, h.ctx); // 行
        handleSelectAll(h.view, h.ctx); // 全体
        handleSelectAll(h.view, h.ctx); // もう一度
        assert.ok(isWholeDoc(h), '3回目で文書全体が維持されていない（先頭行へ巻き戻った）');
    });

    it('pressKey 経由でも 2回目で文書全体（plugin 経路、native 不要）', async () => {
        h = await createPreviewEditor('alpha line\n\nBRAVO line\n\ncharlie line\n');
        const starts = paragraphContentStarts(h);
        h.setCursor(starts[1]);
        h.pressKey({ code: 'KeyA', key: 'a', meta: true }); // 行
        const res = h.pressKey({ code: 'KeyA', key: 'a', meta: true }); // 全体
        assert.ok(isWholeDoc(h), '2回目で文書全体になっていない');
        assert.strictEqual(res.defaultPrevented, true, '2回目も処理する（native へ委ねない）');
    });

    it('コードブロック: 2回目で文書全体', async () => {
        h = await createPreviewEditor('intro para\n\n```python\ndef foo():\n    return 1\n```\n');
        const codePos = findFirstPosOfType(h, 'code_block');
        h.setCursor(codePos);
        handleSelectAll(h.view, h.ctx); // コード内容
        assert.ok(!isWholeDoc(h), '1回目で全体になってはいけない（コード内容のみ）');
        handleSelectAll(h.view, h.ctx); // 文書全体
        assert.ok(isWholeDoc(h), 'コードブロック2回目で文書全体になっていない');
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
