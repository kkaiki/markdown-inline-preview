/**
 * Live モード Phase 2: リスト・チェックボックス・引用の記法スキャン（純関数）。
 *
 * Obsidian 実測（obsidian-observed-spec.md §2.3〜§2.5）では、この3つは他の記法と
 * 扱いが違う:
 *   - 箇条書きの "-" と引用の ">" は **常時変換**（never スコープ）。カーソルが真上に
 *     来ても生の記号に戻らない。ただし文字は DOM から消さず**透明化して幅を残す**ので、
 *     カーソルは普通に通過でき、桁位置はソースと 1:1 のまま。
 *   - チェックボックス "- [ ]" は**トークンスコープ**で、オフセット 0〜5 では生テキスト、
 *     6 以降ではチェックボックス UI になる。
 *
 * この違いを取り違えると「リストにカーソルを置いたら - が出てガタッとずれる」など、
 * Obsidian と明確に違う操作感になるため、純関数のレベルで固定する。
 */
import * as assert from 'assert';
import { scanSyntaxRanges, type SyntaxRange } from '../../../../src/live/shared/syntaxRanges';

function pick(ranges: SyntaxRange[], kind: string): SyntaxRange[] {
    return ranges.filter((r) => r.kind === kind);
}

describe('Live モード: 箇条書きマーカー', () => {
    it('"- " をマーカーとして検出する', () => {
        const r = pick(scanSyntaxRanges('- 項目1\n'), 'listMarker')[0];
        assert.ok(r, 'listMarker が検出されない');
        assert.strictEqual(r.markFrom, 0);
        assert.strictEqual(r.markTo, 1, 'マーカー文字 "-" の1文字だけを装飾対象にする');
    });

    it('"* " と "+ " もマーカーとして検出する', () => {
        assert.strictEqual(pick(scanSyntaxRanges('* 項目\n'), 'listMarker').length, 1);
        assert.strictEqual(pick(scanSyntaxRanges('+ 項目\n'), 'listMarker').length, 1);
    });

    it('常時変換（never）スコープ = カーソルが来ても展開しない', () => {
        const r = pick(scanSyntaxRanges('- 項目1\n'), 'listMarker')[0];
        assert.strictEqual(r.scope, 'never');
    });

    it('DOM から文字を消さない（hidden は空）', () => {
        const r = pick(scanSyntaxRanges('- 項目1\n'), 'listMarker')[0];
        assert.deepStrictEqual(r.hidden, [], 'リストの "-" は消さずに透明化する');
    });

    it('インデントされたネスト項目も検出し、階層を持つ', () => {
        const ranges = pick(scanSyntaxRanges('- 親\n  - 子\n    - 孫\n'), 'listMarker');
        assert.deepStrictEqual(ranges.map((r) => r.level), [1, 2, 3]);
    });

    it('タブインデントも階層として数える', () => {
        const ranges = pick(scanSyntaxRanges('- 親\n\t- 子\n'), 'listMarker');
        assert.deepStrictEqual(ranges.map((r) => r.level), [1, 2]);
    });

    it('番号リストは数字ごと表示するので別 kind にする', () => {
        const r = pick(scanSyntaxRanges('1. 番号1\n'), 'orderedMarker')[0];
        assert.ok(r, 'orderedMarker が検出されない');
        assert.strictEqual(r.scope, 'never');
        assert.deepStrictEqual(r.hidden, []);
    });

    it('水平線 "---" はリストマーカーではない', () => {
        assert.deepStrictEqual(pick(scanSyntaxRanges('---\n'), 'listMarker'), []);
    });

    it('"-" の後ろに空白が無いものはリストではない', () => {
        assert.deepStrictEqual(pick(scanSyntaxRanges('-項目\n'), 'listMarker'), []);
    });
});

describe('Live モード: チェックボックス', () => {
    it('"- [ ] " を task として検出する', () => {
        const r = pick(scanSyntaxRanges('- [ ] タスク\n'), 'task')[0];
        assert.ok(r, 'task が検出されない');
        assert.strictEqual(r.checked, false);
    });

    it('"- [x] " はチェック済みとして検出する', () => {
        const r = pick(scanSyntaxRanges('- [x] 済み\n'), 'task')[0];
        assert.strictEqual(r.checked, true);
    });

    it('大文字の [X] もチェック済み', () => {
        assert.strictEqual(pick(scanSyntaxRanges('- [X] 済み\n'), 'task')[0].checked, true);
    });

    it('トークンスコープで、展開範囲は行頭〜行頭+5（実測どおり）', () => {
        const r = pick(scanSyntaxRanges('- [ ] タスク\n'), 'task')[0];
        assert.strictEqual(r.scope, 'token');
        assert.strictEqual(r.revealFrom, 0);
        assert.strictEqual(r.revealTo, 5);
    });

    it('収縮時は "- [ ]" の5文字を置換する（後ろの空白は残す）', () => {
        const doc = '- [ ] タスク\n';
        const r = pick(scanSyntaxRanges(doc), 'task')[0];
        assert.deepStrictEqual(r.hidden, [{ from: 0, to: 5 }]);
        assert.strictEqual(doc.slice(0, 5), '- [ ]');
    });

    it('チェックボックス行は箇条書きマーカーとして二重検出しない', () => {
        assert.deepStrictEqual(pick(scanSyntaxRanges('- [ ] タスク\n'), 'listMarker'), []);
    });

    it('"- [] " はチェックボックスではない（実測: Obsidian も補正しない）', () => {
        assert.deepStrictEqual(pick(scanSyntaxRanges('- [] タスク\n'), 'task'), []);
    });
});

describe('Live モード: 引用マーカー', () => {
    it('"> " をマーカーとして検出する', () => {
        const r = pick(scanSyntaxRanges('> 引用\n'), 'quoteMarker')[0];
        assert.ok(r, 'quoteMarker が検出されない');
        assert.strictEqual(r.scope, 'never');
        assert.deepStrictEqual(r.hidden, [], '">" は消さずに透明化する');
    });

    it('多重引用はネスト段数を持つ', () => {
        const ranges = pick(scanSyntaxRanges('> a\n>> b\n>>> c\n'), 'quoteMarker');
        assert.deepStrictEqual(ranges.map((r) => r.level), [1, 2, 3]);
    });

    it('引用の中の強調も通常どおり検出する', () => {
        const ranges = scanSyntaxRanges('> **太字** の引用\n');
        assert.strictEqual(pick(ranges, 'quoteMarker').length, 1);
        assert.strictEqual(pick(ranges, 'strong').length, 1);
    });

    it('引用の中の箇条書きも検出する', () => {
        const ranges = scanSyntaxRanges('> - 項目\n');
        assert.strictEqual(pick(ranges, 'quoteMarker').length, 1);
        assert.strictEqual(pick(ranges, 'listMarker').length, 1);
    });
});
