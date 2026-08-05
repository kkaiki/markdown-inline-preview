/**
 * コードフェンスのブロック検出（純関数）。
 *
 * ユーザー報告（2026-08-05）:「``` の中で ⌘A してもその中以外の全てが選択される」。
 * 原因は **フェンス検出が装飾側と ⌘A 側で別実装**になっていて、ペアリング規則が
 * 食い違っていたこと。判定をこのモジュールに集約し、CommonMark の規則
 * （閉じフェンスは開きと同じ記号・同じ長さ以上・info string を持たない）を固定する。
 */
import * as assert from 'assert';
import { findFenceBlocks } from '../../../../src/live/shared/fenceBlocks';

const lines = (doc: string): string[] => doc.split('\n');

describe('Live モード: コードフェンスのブロック検出', () => {
    it('開きと閉じのペアを見つける', () => {
        const b = findFenceBlocks(lines('あ\n```js\nx\n```\nい\n'));
        assert.strictEqual(b.length, 1);
        assert.deepStrictEqual({ open: b[0].openLine, close: b[0].closeLine, info: b[0].info }, {
            open: 1,
            close: 3,
            info: 'js'
        });
    });

    it('閉じていないフェンスは closeLine が null', () => {
        const b = findFenceBlocks(lines('```js\nx\n'));
        assert.strictEqual(b[0].closeLine, null);
    });

    it('開いたままのフェンスの中の "```js" は閉じフェンスにしない', () => {
        // CommonMark: info string を持つ行は閉じフェンスになれない。
        // 1本目は「info を持たない次の ```」で閉じる。
        const b = findFenceBlocks(lines('```\nあ\n\n```js\nx\n```\n'));
        assert.strictEqual(b.length, 1, `ブロックは1つのはず: ${JSON.stringify(b)}`);
        assert.strictEqual(b[0].openLine, 0);
        assert.strictEqual(b[0].closeLine, 5);
    });

    it('4連バッククォートの中の3連は閉じフェンスにしない（CommonMark の長さ規則）', () => {
        const b = findFenceBlocks(lines('````\n```\nx\n```\n````\n'));
        assert.strictEqual(b.length, 1);
        assert.strictEqual(b[0].openLine, 0);
        assert.strictEqual(b[0].closeLine, 4, '長さが同じ以上の行だけが閉じる');
    });

    it('info string を持つ行は閉じフェンスにしない', () => {
        const b = findFenceBlocks(lines('```\nx\n```js\ny\n```\n'));
        assert.strictEqual(b[0].closeLine, 4);
    });

    it('チルダとバッククォートは互いに閉じない', () => {
        const b = findFenceBlocks(lines('~~~\n```\nx\n~~~\n'));
        assert.strictEqual(b[0].closeLine, 3);
    });

    it('本文が無いフェンスも1つのブロックとして返す', () => {
        const b = findFenceBlocks(lines('```\n```\n'));
        assert.deepStrictEqual({ open: b[0].openLine, close: b[0].closeLine }, { open: 0, close: 1 });
    });

    it('フェンスが2つ並べばブロックも2つ', () => {
        const b = findFenceBlocks(lines('```\na\n```\n\n```\nb\n```\n'));
        assert.strictEqual(b.length, 2);
    });
});
