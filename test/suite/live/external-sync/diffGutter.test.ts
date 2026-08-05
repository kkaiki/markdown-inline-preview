/**
 * Phase 6b: Git HEAD との行差分（純関数）のテスト。
 *
 * Live モードはドキュメントが生 Markdown そのものなので、差分も**行単位**で取れる
 * （既存 Preview はブロック単位だった）。既存の `diffBlocks` を行の配列に対して
 * 使い回す薄いラッパを検証する。
 *
 * 「記法の展開/収縮では差分が変わらない」ことは requirements.md 受け入れ基準 #9 で
 * 実ブラウザ側が担保する。ここでは行差分そのものの正しさを固定する。
 */
import * as assert from 'assert';
import { computeLineDiff } from '../../../../src/live/shared/lineDiff';

describe('Live モード: 行差分', () => {
    it('変更が無ければすべて unchanged', () => {
        const d = computeLineDiff('a\nb\nc\n', 'a\nb\nc\n');
        assert.deepStrictEqual(d.statuses, ['unchanged', 'unchanged', 'unchanged', 'unchanged']);
    });

    it('行を書き換えると modified になる', () => {
        const d = computeLineDiff('a\nb\nc\n', 'a\nB\nc\n');
        assert.deepStrictEqual(d.statuses, ['unchanged', 'modified', 'unchanged', 'unchanged']);
    });

    it('行を足すと added になる', () => {
        const d = computeLineDiff('a\nc\n', 'a\nb\nc\n');
        assert.deepStrictEqual(d.statuses, ['unchanged', 'added', 'unchanged', 'unchanged']);
    });

    it('行を消すとその位置に削除マーカーが立つ', () => {
        const d = computeLineDiff('a\nb\nc\n', 'a\nc\n');
        assert.deepStrictEqual(d.statuses, ['unchanged', 'unchanged', 'unchanged']);
        assert.strictEqual(d.deletionsBefore[1], 1, '2行目の手前に削除がある');
    });

    it('HEAD が無い（新規ファイル）ときは全行 added', () => {
        const d = computeLineDiff(null, 'a\nb\n');
        assert.deepStrictEqual(d.statuses, ['added', 'added', 'added']);
    });

    it('空の HEAD でも落ちない', () => {
        const d = computeLineDiff('', 'a\n');
        assert.strictEqual(d.statuses.length, 2);
    });

    it('CRLF の HEAD でも行として比較できる', () => {
        const d = computeLineDiff('a\r\nb\r\n', 'a\nb\n');
        assert.deepStrictEqual(d.statuses, ['unchanged', 'unchanged', 'unchanged']);
    });

    it('先頭への挿入も正しく added になる', () => {
        const d = computeLineDiff('b\n', 'a\nb\n');
        assert.strictEqual(d.statuses[0], 'added');
        assert.strictEqual(d.statuses[1], 'unchanged');
    });

    it('複数行の連続変更をまとめて modified にする', () => {
        const d = computeLineDiff('a\nb\nc\nd\n', 'a\nB\nC\nd\n');
        assert.deepStrictEqual(d.statuses.slice(1, 3), ['modified', 'modified']);
    });
});
