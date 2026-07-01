import * as assert from 'assert';
import {
    scrollRatioFromLine,
    scrollRatioFromPixels,
    lineFromScrollRatio,
    pixelsFromScrollRatio,
    contentScrollHeight
} from '../../src/shared/preview/scrollSync';

describe('scrollSync: scrollRatioFromLine（行 → 比率）', () => {
    it('先頭行は 0', () => {
        assert.strictEqual(scrollRatioFromLine(0, 100), 0);
    });
    it('中ほどの行は topLine / lineCount', () => {
        assert.strictEqual(scrollRatioFromLine(50, 100), 0.5);
    });
    it('1 行以下のドキュメントは同期しない（undefined）', () => {
        assert.strictEqual(scrollRatioFromLine(0, 1), undefined);
        assert.strictEqual(scrollRatioFromLine(0, 0), undefined);
    });
    it('範囲外の行はクランプされる', () => {
        assert.strictEqual(scrollRatioFromLine(-5, 100), 0);
        assert.strictEqual(scrollRatioFromLine(999, 100), 99 / 100);
    });
});

describe('scrollSync: scrollRatioFromPixels（px → 比率）', () => {
    it('スクロール最上部は 0', () => {
        assert.strictEqual(scrollRatioFromPixels(0, 2000, 500), 0);
    });
    it('最下部は 1', () => {
        assert.strictEqual(scrollRatioFromPixels(1500, 2000, 500), 1);
    });
    it('中間は比率になる', () => {
        assert.strictEqual(scrollRatioFromPixels(750, 2000, 500), 0.5);
    });
    it('スクロール不能（中身がビューより小さい）でも 0 を返す', () => {
        assert.strictEqual(scrollRatioFromPixels(0, 300, 500), 0);
    });
    it('0〜1 にクランプ', () => {
        assert.strictEqual(scrollRatioFromPixels(99999, 2000, 500), 1);
    });
});

describe('scrollSync: lineFromScrollRatio（比率 → 行）', () => {
    it('0 は先頭行', () => {
        assert.strictEqual(lineFromScrollRatio(0, 100), 0);
    });
    it('0.5 は中ほどの行', () => {
        assert.strictEqual(lineFromScrollRatio(0.5, 100), 50);
    });
    it('1 は最終行にクランプ', () => {
        assert.strictEqual(lineFromScrollRatio(1, 100), 99);
    });
    it('空ドキュメントは 0', () => {
        assert.strictEqual(lineFromScrollRatio(0.5, 0), 0);
    });
});

describe('scrollSync: pixelsFromScrollRatio（比率 → px）', () => {
    it('0 は最上部', () => {
        assert.strictEqual(pixelsFromScrollRatio(0, 2000, 500), 0);
    });
    it('1 は最大スクロール量', () => {
        assert.strictEqual(pixelsFromScrollRatio(1, 2000, 500), 1500);
    });
    it('スクロール不能なら 0', () => {
        assert.strictEqual(pixelsFromScrollRatio(0.5, 300, 500), 0);
    });
});

describe('scrollSync: contentScrollHeight（scroll-beyond 余白の除外）', () => {
    it('余白分を差し引いた実コンテンツ高を返す', () => {
        assert.strictEqual(contentScrollHeight(2000, 600), 1400);
    });
    it('余白 0 ならそのまま', () => {
        assert.strictEqual(contentScrollHeight(2000, 0), 2000);
    });
    it('負値（余白が高さを超える）でも 0 未満にならない', () => {
        assert.strictEqual(contentScrollHeight(500, 800), 0);
        assert.strictEqual(contentScrollHeight(500, -100), 500);
    });

    it('実コンテンツ末尾は ratio≈1、さらに余白内へスクロールしても 1 にクランプ', () => {
        // scrollHeight=2600（= 本文 1500 + ビュー 500 ぶんの余白 ... 単純化した代表値）
        // beyond=900 を除くと実コンテンツ高は 1700、最大スクロール量は 1700-500=1200。
        const scrollHeight = 2600;
        const clientHeight = 500;
        const beyond = 900;
        const effective = contentScrollHeight(scrollHeight, beyond); // 1700
        // 実コンテンツ末尾（scrollTop=1200）で ratio≈1
        assert.strictEqual(scrollRatioFromPixels(1200, effective, clientHeight), 1);
        // さらに余白内（scrollTop=2000）へスクロールしても 1 にクランプ
        assert.strictEqual(scrollRatioFromPixels(2000, effective, clientHeight), 1);
        // 中間（scrollTop=600）は本文基準の比率（余白を含めない）
        assert.strictEqual(scrollRatioFromPixels(600, effective, clientHeight), 0.5);
    });

    it('余白を除外しないと末尾でも ratio<1 になってしまう（除外の必要性）', () => {
        const scrollHeight = 2600;
        const clientHeight = 500;
        // 余白を含めたまま（誤った計算）だと、本文末尾 scrollTop=1200 でも 1 未満
        const wrong = scrollRatioFromPixels(1200, scrollHeight, clientHeight);
        assert.ok(wrong < 1, `余白込みだと末尾で ratio<1 になるはず: ${wrong}`);
    });
});

describe('scrollSync: 行 ↔ 比率 の往復が安定している', () => {
    it('行 → 比率 → 行 で元に戻る（代表値）', () => {
        const lineCount = 200;
        for (const line of [0, 1, 37, 100, 150, 199]) {
            const ratio = scrollRatioFromLine(line, lineCount);
            assert.ok(ratio !== undefined);
            const back = lineFromScrollRatio(ratio, lineCount);
            assert.ok(Math.abs(back - line) <= 1, `line=${line} → ratio=${ratio} → ${back}`);
        }
    });
});
