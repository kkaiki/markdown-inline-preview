/**
 * Raw ⇄ Preview のカーソル位置引き継ぎ（共有マッピング）のユニットテスト。
 */
import * as assert from 'assert';
import {
    blockPrefixLength,
    segmentBlocks,
    rawToCursorAnchor,
    cursorAnchorToRaw
} from '../../src/shared/preview/cursorAnchor';

describe('cursorAnchor: blockPrefixLength', () => {
    it('見出し/リスト/番号/チェックボックス/引用の行頭マーカー長', () => {
        assert.strictEqual(blockPrefixLength('# H'), 2);
        assert.strictEqual(blockPrefixLength('### H'), 4);
        assert.strictEqual(blockPrefixLength('- item'), 2);
        assert.strictEqual(blockPrefixLength('* item'), 2);
        assert.strictEqual(blockPrefixLength('1. item'), 3);
        assert.strictEqual(blockPrefixLength('1) item'), 3);
        assert.strictEqual(blockPrefixLength('- [ ] task'), 6);
        assert.strictEqual(blockPrefixLength('- [x] done'), 6);
        assert.strictEqual(blockPrefixLength('> quote'), 2);
        assert.strictEqual(blockPrefixLength('  - nested'), 4);
        assert.strictEqual(blockPrefixLength('plain text'), 0);
    });
});

describe('cursorAnchor: segmentBlocks', () => {
    it('空行で段落を分割する', () => {
        assert.deepStrictEqual(segmentBlocks('A\n\nB'), [
            { startLine: 0, lineCount: 1 },
            { startLine: 2, lineCount: 1 }
        ]);
    });

    it('連続するリスト行は 1 ブロック', () => {
        assert.deepStrictEqual(segmentBlocks('- a\n- b\n- c'), [
            { startLine: 0, lineCount: 3 }
        ]);
    });

    it('フェンスコードは中の空行も含めて 1 ブロック', () => {
        const src = 'text\n\n```\ncode\n\nmore\n```\n\nafter';
        assert.deepStrictEqual(segmentBlocks(src), [
            { startLine: 0, lineCount: 1 },  // text
            { startLine: 2, lineCount: 5 },  // ``` ... ```
            { startLine: 8, lineCount: 1 }   // after
        ]);
    });

    it('見出し・段落・リストの混在', () => {
        const src = '# Title\n\npara\n\n- a\n- b';
        assert.deepStrictEqual(segmentBlocks(src), [
            { startLine: 0, lineCount: 1 },
            { startLine: 2, lineCount: 1 },
            { startLine: 4, lineCount: 2 }
        ]);
    });
});

describe('cursorAnchor: rawToCursorAnchor / cursorAnchorToRaw', () => {
    it('プレーン段落はオフセットがそのまま', () => {
        assert.deepStrictEqual(rawToCursorAnchor('hello world', 0, 6), { block: 0, offset: 6 });
    });

    it('見出しは行頭マーカーを除いたオフセット', () => {
        assert.deepStrictEqual(rawToCursorAnchor('## Title', 0, 5), { block: 0, offset: 2 });
    });

    it('リスト項目も行頭マーカーを除く', () => {
        assert.deepStrictEqual(rawToCursorAnchor('- item', 0, 4), { block: 0, offset: 2 });
    });

    it('2 番目の段落はブロック index 1', () => {
        assert.deepStrictEqual(rawToCursorAnchor('A\n\nBcd', 2, 2), { block: 1, offset: 2 });
    });

    it('往復で元の位置に戻る（プレーン段落）', () => {
        const src = 'first\n\nsecond paragraph\n\nthird';
        for (const [line, ch] of [[0, 3], [2, 7], [4, 2]] as Array<[number, number]>) {
            const anchor = rawToCursorAnchor(src, line, ch);
            const back = cursorAnchorToRaw(src, anchor);
            assert.deepStrictEqual(back, { line, character: ch }, `(${line},${ch}) の往復が崩れた`);
        }
    });

    it('往復で元の位置に戻る（見出し/リスト）', () => {
        const src = '## Heading here\n\n- list item';
        for (const [line, ch] of [[0, 7], [2, 5]] as Array<[number, number]>) {
            const anchor = rawToCursorAnchor(src, line, ch);
            const back = cursorAnchorToRaw(src, anchor);
            assert.deepStrictEqual(back, { line, character: ch });
        }
    });

    it('空行上のカーソルは近いブロック先頭へ寄せる', () => {
        const anchor = rawToCursorAnchor('A\n\nB', 1, 0); // 空行
        assert.strictEqual(anchor.offset, 0);
        assert.ok(anchor.block === 0 || anchor.block === 1);
    });

    it('範囲外ブロック index はクランプ', () => {
        const back = cursorAnchorToRaw('only one block', { block: 99, offset: 3 });
        assert.deepStrictEqual(back, { line: 0, character: 3 });
    });
});
