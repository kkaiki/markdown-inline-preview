/**
 * Live モードの host ⇄ webview 差分同期の純関数テスト。
 *
 * requirements.md R4.2 のとおり、Live モードは**文書全体の置き換えを絶対にしない**。
 * webview の編集は `{ from, to, insert }` の差分として host へ渡り、host はそれを
 * VS Code の `Range` へ変換して `WorkspaceEdit` にする。全体置換をすると
 * Undo 履歴と Git 差分が壊れる（既存 Preview が過去に踏んだ問題）。
 *
 * また、host→webview→host のエコーバックで編集が二重適用されないよう、
 * リビジョン番号でガードする。ここではその判定ロジックを固定する。
 */
import * as assert from 'assert';
import {
    offsetToPosition,
    changeToRange,
    applyChanges,
    createEchoGuard
} from '../../../../src/live/shared/documentSync';

describe('Live モード: オフセット → 行/桁の変換', () => {
    const doc = 'abc\nde\n\nfghi';

    it('先頭は 0行0桁', () => {
        assert.deepStrictEqual(offsetToPosition(doc, 0), { line: 0, character: 0 });
    });

    it('行内のオフセットを桁に変換する', () => {
        assert.deepStrictEqual(offsetToPosition(doc, 2), { line: 0, character: 2 });
    });

    it('改行の直後は次の行の0桁', () => {
        assert.deepStrictEqual(offsetToPosition(doc, 4), { line: 1, character: 0 });
    });

    it('空行を正しく数える', () => {
        assert.deepStrictEqual(offsetToPosition(doc, 7), { line: 2, character: 0 });
        assert.deepStrictEqual(offsetToPosition(doc, 8), { line: 3, character: 0 });
    });

    it('末尾のオフセットも変換できる', () => {
        assert.deepStrictEqual(offsetToPosition(doc, doc.length), { line: 3, character: 4 });
    });

    it('CRLF でも行数を1回だけ数える', () => {
        const crlf = 'ab\r\ncd';
        assert.deepStrictEqual(offsetToPosition(crlf, 4), { line: 1, character: 0 });
    });
});

describe('Live モード: 差分 → Range の変換', () => {
    const doc = 'hello\nworld';

    it('1文字挿入は幅0の Range になる', () => {
        const r = changeToRange(doc, { from: 5, to: 5, insert: '!' });
        assert.deepStrictEqual(r, {
            start: { line: 0, character: 5 },
            end: { line: 0, character: 5 },
            insert: '!'
        });
    });

    it('置換は元テキストの範囲を指す', () => {
        const r = changeToRange(doc, { from: 0, to: 5, insert: 'HELLO' });
        assert.deepStrictEqual(r.start, { line: 0, character: 0 });
        assert.deepStrictEqual(r.end, { line: 0, character: 5 });
    });

    it('改行をまたぐ削除も行/桁で表現できる', () => {
        const r = changeToRange(doc, { from: 3, to: 8, insert: '' });
        assert.deepStrictEqual(r.start, { line: 0, character: 3 });
        assert.deepStrictEqual(r.end, { line: 1, character: 2 });
        assert.strictEqual(r.insert, '');
    });
});

describe('Live モード: 差分の適用', () => {
    it('単一の差分を適用する', () => {
        assert.strictEqual(applyChanges('abc', [{ from: 1, to: 2, insert: 'X' }]), 'aXc');
    });

    it('複数の差分を「元テキストのオフセット」基準で適用する', () => {
        // 呼び出し側が位置をずらして渡さなくて済むよう、後ろから適用する。
        const out = applyChanges('abcdef', [
            { from: 1, to: 2, insert: 'X' },
            { from: 4, to: 5, insert: 'Y' }
        ]);
        assert.strictEqual(out, 'aXcdYf');
    });

    it('挿入だけの差分も扱える', () => {
        assert.strictEqual(applyChanges('ab', [{ from: 1, to: 1, insert: '--' }]), 'a--b');
    });

    it('差分が空なら元のまま', () => {
        assert.strictEqual(applyChanges('abc', []), 'abc');
    });
});

describe('Live モード: エコーバック抑止', () => {
    it('自分が送った編集の反映は無視する', () => {
        const guard = createEchoGuard();
        const rev = guard.markLocal();
        assert.strictEqual(guard.shouldApply(rev), false);
    });

    it('外部（Raw / AI / Git）由来の変更は適用する', () => {
        const guard = createEchoGuard();
        guard.markLocal();
        assert.strictEqual(guard.shouldApply(undefined), true);
    });

    it('同じリビジョンを2回無視しない（1度消費したら次は適用する）', () => {
        const guard = createEchoGuard();
        const rev = guard.markLocal();
        guard.shouldApply(rev);
        assert.strictEqual(guard.shouldApply(rev), true);
    });

    it('複数の未確定編集があっても、対応するものだけ無視する', () => {
        const guard = createEchoGuard();
        const a = guard.markLocal();
        const b = guard.markLocal();
        assert.strictEqual(guard.shouldApply(b), false);
        assert.strictEqual(guard.shouldApply(a), false);
        assert.strictEqual(guard.shouldApply(undefined), true);
    });
});
