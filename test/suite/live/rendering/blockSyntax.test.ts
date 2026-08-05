/**
 * Live モード Phase 3・4: コードフェンスと表のブロック記法スキャン（純関数）。
 *
 * Obsidian 実測（obsidian-observed-spec.md §2.7・§2.8）:
 *   - コードフェンスは **ブロックスコープ**。本文行にカーソルを置くだけで開始・終了の
 *     両フェンスが生テキストに戻る。収縮時は開始フェンスが言語ラベル、終了フェンスが空。
 *   - 表は Obsidian では「常時レンダリング（never）＋セル内編集」だが、我々は
 *     まず**ブロックスコープ**で実装する（カーソルが表の中にあるときだけ生のパイプ記法）。
 *     この差分は requirements.md §2.7 の逸脱として明記してある。
 */
import * as assert from 'assert';
import { scanSyntaxRanges, type SyntaxRange } from '../../../../src/live/shared/syntaxRanges';

function pick(ranges: SyntaxRange[], kind: string): SyntaxRange[] {
    return ranges.filter((r) => r.kind === kind);
}

describe('Live モード: コードフェンス', () => {
    const DOC = 'あ\n\n```js\nconst a = 1;\nconsole.log(a);\n```\n\nい\n';

    it('フェンスブロックを1つのトークンとして検出する', () => {
        const r = pick(scanSyntaxRanges(DOC), 'codeFence');
        assert.strictEqual(r.length, 1);
    });

    it('ブロックスコープになる（本文行でも両フェンスが展開される）', () => {
        assert.strictEqual(pick(scanSyntaxRanges(DOC), 'codeFence')[0].scope, 'block');
    });

    it('展開範囲は開始フェンス行頭から終了フェンス行末まで', () => {
        const r = pick(scanSyntaxRanges(DOC), 'codeFence')[0];
        assert.strictEqual(DOC.slice(r.revealFrom, r.revealTo), '```js\nconst a = 1;\nconsole.log(a);\n```');
    });

    it('言語（info string）を持つ', () => {
        assert.strictEqual(pick(scanSyntaxRanges(DOC), 'codeFence')[0].info, 'js');
    });

    it('隠す範囲は開始フェンス行と終了フェンス行の2つ', () => {
        const r = pick(scanSyntaxRanges(DOC), 'codeFence')[0];
        assert.strictEqual(r.hidden.length, 2);
        assert.strictEqual(DOC.slice(r.hidden[0].from, r.hidden[0].to), '```js');
        assert.strictEqual(DOC.slice(r.hidden[1].from, r.hidden[1].to), '```');
    });

    it('言語指定が無いフェンスも検出する', () => {
        const doc = '```\nx\n```\n';
        const r = pick(scanSyntaxRanges(doc), 'codeFence')[0];
        assert.ok(r);
        assert.strictEqual(r.info, '');
    });

    it('閉じられていないフェンスは文書末までをブロックとする', () => {
        const doc = 'あ\n```js\nconst a = 1;\n';
        const r = pick(scanSyntaxRanges(doc), 'codeFence')[0];
        assert.ok(r);
        assert.strictEqual(r.hidden.length, 1, '終了フェンスが無いので隠す範囲は1つ');
        assert.strictEqual(r.revealTo, doc.length);
    });

    it('チルダフェンスも検出する', () => {
        assert.strictEqual(pick(scanSyntaxRanges('~~~py\nx\n~~~\n'), 'codeFence').length, 1);
    });

    it('フェンスが2つ並んでいればブロックも2つ', () => {
        const doc = '```\na\n```\n\n```\nb\n```\n';
        assert.strictEqual(pick(scanSyntaxRanges(doc), 'codeFence').length, 2);
    });
});

describe('Live モード: 表', () => {
    const DOC = '前\n\n| 列A | 列B |\n| --- | --- |\n| a1 | b1 |\n| a2 | b2 |\n\n後\n';

    it('表ブロックを1つのトークンとして検出する', () => {
        assert.strictEqual(pick(scanSyntaxRanges(DOC), 'table').length, 1);
    });

    it('展開範囲は表の先頭行から最終行まで', () => {
        const r = pick(scanSyntaxRanges(DOC), 'table')[0];
        assert.strictEqual(
            DOC.slice(r.revealFrom, r.revealTo),
            '| 列A | 列B |\n| --- | --- |\n| a1 | b1 |\n| a2 | b2 |'
        );
    });

    it('収縮時はブロック全体を1つのウィジェットで置換する', () => {
        const r = pick(scanSyntaxRanges(DOC), 'table')[0];
        assert.strictEqual(r.hidden.length, 1);
        assert.strictEqual(r.hidden[0].from, r.revealFrom);
        assert.strictEqual(r.hidden[0].to, r.revealTo);
    });

    it('区切り行が無ければ表ではない', () => {
        assert.deepStrictEqual(pick(scanSyntaxRanges('| a | b |\n| c | d |\n'), 'table'), []);
    });

    it('見出し行と区切り行だけ（本文0行）でも表として扱う', () => {
        assert.strictEqual(pick(scanSyntaxRanges('| a | b |\n| --- | --- |\n'), 'table').length, 1);
    });

    it('コロン付きの区切り行（配置指定）も認める', () => {
        assert.strictEqual(pick(scanSyntaxRanges('| a | b |\n|:---|---:|\n| 1 | 2 |\n'), 'table').length, 1);
    });

    it('コードフェンスの中のパイプ行は表にしない', () => {
        const doc = '```\n| a | b |\n| --- | --- |\n```\n';
        assert.deepStrictEqual(pick(scanSyntaxRanges(doc), 'table'), []);
    });

    it('表の中のパイプ行を強調記法として拾わない', () => {
        const doc = '| **太字** | b |\n| --- | --- |\n| 1 | 2 |\n';
        assert.deepStrictEqual(pick(scanSyntaxRanges(doc), 'strong'), []);
    });
});
