/**
 * チェックボックス（タスクリスト）項目の Enter 継続以外の編集操作
 * （文中 Enter による分割・Delete によるマージ・テキスト編集・
 * インデント/アウトデント・複数項目にまたがる選択削除）を検証する。
 * `checkboxEnter.test.ts` は行末 Enter のみを扱うため、それ以外の編集経路の
 * `checked` 属性の扱いをここで固定する。
 *
 * このファイルのハーネス（`milkdownHarness.ts`）は `commonmark`/`gfm` プリセットのみで、
 * `markerBackspace`/`blockPrefixEditPlugin` 等の実アプリのカスタムプラグインを含まない
 * （list-item-block が jsdom で使えないため素の schema-list 既定動作の確認用）。
 * そのため **「チェックボックス項目の行頭」での単発 Backspace** は本ファイルでは扱わない
 * （markerBackspace が横取りする経路のため、素の ProseMirror 既定動作は実際のアプリ挙動と
 * 異なる＝偽装カバレッジになる）。その経路は
 * `test/webview/focus-expand/blockPrefixEdit.integration.test.ts`
 * （`markerBackspace`+`blockPrefixEditPlugin` を両方ロードする専用ハーネス）で検証する。
 * 範囲選択を伴う Backspace は markerBackspace が selection.empty で早期リターンするため
 * ここでの検証で実挙動と一致する。
 */
import '../jsdomSetup';
import * as assert from 'assert';
import { createPreviewEditor, type PreviewEditorHandle } from '../milkdownHarness';

function checkedStates(h: PreviewEditorHandle): Array<boolean | null | undefined> {
    const states: Array<boolean | null | undefined> = [];
    h.view.state.doc.descendants((n) => {
        if (n.type.name === 'list_item') states.push(n.attrs.checked as boolean | null | undefined);
    });
    return states;
}

/** ドキュメント内で n 番目（1始まり）のテキストノードの開始位置を返す。 */
function nthTextPos(h: PreviewEditorHandle, n: number): number {
    let pos = -1;
    let count = 0;
    h.view.state.doc.descendants((node, p) => {
        if (node.isText) {
            count++;
            if (count === n) pos = p;
        }
    });
    if (pos === -1) throw new Error(`${n} 番目のテキストノードが見つからない`);
    return pos;
}

describe('webview統合: チェックボックスの編集・削除・インデント', () => {
    let h: PreviewEditorHandle;
    afterEach(() => h?.destroy());

    it('チェック済み項目のテキスト中央で Enter して分割すると、新項目は未チェックになる', async () => {
        h = await createPreviewEditor('- [x] hello world\n');
        h.setCursor(nthTextPos(h, 1) + 5); // "hello" の直後
        h.pressKey({ key: 'Enter', code: 'Enter' });

        const states = checkedStates(h);
        assert.strictEqual(states.length, 2, `項目数が想定外: ${JSON.stringify(states)}`);
        assert.strictEqual(states[0], true, '前半（元の項目）はチェック済みのまま');
        assert.strictEqual(states[1], false, `文中分割した後半の新項目は未チェックであるべき: ${JSON.stringify(states)}`);
    });

    it('チェックボックス項目末尾での Delete は後続の通常段落を同じリストの新規項目として取り込む', async () => {
        h = await createPreviewEditor('- [x] task\n\nnext paragraph\n');
        const textEndPos = nthTextPos(h, 1) + 'task'.length;
        h.setCursor(textEndPos);
        h.pressKey({ key: 'Delete', code: 'Delete' });

        assert.deepStrictEqual(h.topLevelTypes(), ['bullet_list'],
            `後続段落がリスト外に残ってはいけない: ${JSON.stringify(h.topLevelTypes())}`);
        const states = checkedStates(h);
        assert.strictEqual(states.length, 2, `取り込み後も2項目であるべき: ${JSON.stringify(states)}`);
        assert.strictEqual(states[0], true, '1項目目（task）は checked=true のまま');
        assert.ok(h.serialize().includes('next paragraph'),
            `取り込んだ段落のテキストが保持されるべき: ${h.serialize()}`);
    });

    it('チェック済み項目のテキストを編集しても checked は反転しない', async () => {
        h = await createPreviewEditor('- [x] done\n');
        const pos = nthTextPos(h, 1) + 2;
        h.view.dispatch(h.view.state.tr.insertText('X', pos));

        const states = checkedStates(h);
        assert.strictEqual(states[0], true, `テキスト編集だけで checked が変わってはいけない: ${JSON.stringify(states)}`);
        assert.ok(h.serialize().includes('doXne'), `編集後のテキストが反映されるべき: ${h.serialize()}`);
    });

    it('未チェック項目のテキストを編集しても checked は反転しない', async () => {
        h = await createPreviewEditor('- [ ] todo\n');
        const pos = nthTextPos(h, 1) + 2;
        h.view.dispatch(h.view.state.tr.insertText('X', pos));

        const states = checkedStates(h);
        assert.strictEqual(states[0], false, `テキスト編集だけで checked が変わってはいけない: ${JSON.stringify(states)}`);
    });

    it('Tab でチェックボックス項目をインデントしても、各項目の checked は独立して保たれる', async () => {
        h = await createPreviewEditor('- [x] parent\n- [ ] child\n');
        h.setCursor(nthTextPos(h, 2));
        h.pressKey({ key: 'Tab', code: 'Tab' });

        const states = checkedStates(h);
        assert.deepStrictEqual(states, [true, false],
            `インデント後も親 checked=true・子 checked=false が維持されるべき: ${JSON.stringify(states)}`);
        assert.ok(/^\* \[x\] parent\n {2}\* \[ \] child/.test(h.serialize()),
            `子項目がネストされたチェックボックスとして直列化されるべき: ${h.serialize()}`);
    });

    it('Shift+Tab でネストしたチェックボックス項目をアウトデントしても checked は保たれる', async () => {
        h = await createPreviewEditor('- [x] parent\n  - [ ] child\n');
        h.setCursor(nthTextPos(h, 2));
        h.pressKey({ key: 'Tab', code: 'Tab', shift: true });

        const states = checkedStates(h);
        assert.deepStrictEqual(states, [true, false],
            `アウトデント後も親 checked=true・子 checked=false が維持されるべき: ${JSON.stringify(states)}`);
    });

    it('2つのチェックボックス項目にまたがる範囲選択を削除しても、先頭項目の checked のまま1項目にマージされる', async () => {
        h = await createPreviewEditor('- [x] alpha\n- [ ] beta\n');
        const from = nthTextPos(h, 1) + 2; // "al" の直後
        const to = nthTextPos(h, 2) + 2;   // "be" の直後
        h.setSelection(from, to);
        h.pressKey({ key: 'Backspace', code: 'Backspace' });

        const states = checkedStates(h);
        assert.strictEqual(states.length, 1, `2項目が1つにマージされるべき: ${JSON.stringify(states)}`);
        assert.strictEqual(states[0], true, '先頭項目の checked=true を保つべき');
        assert.ok(h.serialize().includes('alta'),
            `境界をまたいだ削除後のテキストが正しく結合されるべき（"al"+"ta"）: ${h.serialize()}`);
    });
});
