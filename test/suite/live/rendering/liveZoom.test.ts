/**
 * ツールバーの拡大率（ズーム）の段階計算を固定する。
 *
 * ユーザー要望（2026-08-09）: 「ツールバーにプラスマイナスを入れて拡大率を入れられるようにして欲しい」。
 *
 * 「+ を押したら次の段階へ、上限では増えない」「壊れた保存値でも 100% に戻る」という
 * 純粋なロジックだけをここ（jsdom）で担保し、DOM への反映は
 * `test/browser/live/rendering/toolbarZoom.test.ts` で見る。
 */
import * as assert from 'assert';
import {
    DEFAULT_ZOOM,
    ZOOM_LEVELS,
    clampZoom,
    formatZoom,
    readZoom,
    writeZoom,
    zoomIn,
    zoomOut
} from '../../../../src/live/shared/liveZoom';

/** localStorage 相当の最小スタブ。 */
function fakeStorage(initial: Record<string, string> = {}) {
    const map = new Map(Object.entries(initial));
    return {
        getItem: (k: string) => map.get(k) ?? null,
        setItem: (k: string, v: string) => void map.set(k, v)
    };
}

describe('Live モード: 拡大率の段階計算', () => {
    it('既定の拡大率は 100% で、段階に含まれる', () => {
        assert.strictEqual(DEFAULT_ZOOM, 1);
        assert.ok(ZOOM_LEVELS.includes(1));
    });

    it('段階は小さい順に並んでいる', () => {
        const sorted = [...ZOOM_LEVELS].sort((a, b) => a - b);
        assert.deepStrictEqual(ZOOM_LEVELS, sorted);
    });

    it('+ を押すと次の段階へ上がる', () => {
        assert.strictEqual(zoomIn(1), ZOOM_LEVELS[ZOOM_LEVELS.indexOf(1) + 1]);
    });

    it('− を押すと前の段階へ下がる', () => {
        assert.strictEqual(zoomOut(1), ZOOM_LEVELS[ZOOM_LEVELS.indexOf(1) - 1]);
    });

    it('上限では + を押しても増えない', () => {
        const max = ZOOM_LEVELS[ZOOM_LEVELS.length - 1];
        assert.strictEqual(zoomIn(max), max);
    });

    it('下限では − を押しても減らない', () => {
        const min = ZOOM_LEVELS[0];
        assert.strictEqual(zoomOut(min), min);
    });

    it('段階の途中の値からでも次／前の段階へ丸められる', () => {
        assert.strictEqual(zoomIn(1.05), 1.1);
        assert.strictEqual(zoomOut(1.05), 1);
    });

    it('範囲外・不正な保存値は 100% に戻す', () => {
        assert.strictEqual(clampZoom(NaN), DEFAULT_ZOOM);
        assert.strictEqual(clampZoom(undefined), DEFAULT_ZOOM);
        assert.strictEqual(clampZoom('1.5'), DEFAULT_ZOOM);
        assert.strictEqual(clampZoom(0.01), ZOOM_LEVELS[0]);
        assert.strictEqual(clampZoom(99), ZOOM_LEVELS[ZOOM_LEVELS.length - 1]);
    });

    it('段階に無い値でも保存値としては受け入れる（丸めない）', () => {
        assert.strictEqual(clampZoom(1.05), 1.05);
    });

    it('拡大率はパーセント表示にする', () => {
        assert.strictEqual(formatZoom(1), '100%');
        assert.strictEqual(formatZoom(0.67), '67%');
        assert.strictEqual(formatZoom(1.25), '125%');
    });

    describe('保存と復元', () => {
        it('保存した拡大率を読み戻せる', () => {
            const s = fakeStorage();
            writeZoom(s, 1.25);
            assert.strictEqual(readZoom(s), 1.25);
        });

        it('保存が無ければ 100%', () => {
            assert.strictEqual(readZoom(fakeStorage()), DEFAULT_ZOOM);
        });

        it('壊れた保存値なら 100%', () => {
            assert.strictEqual(readZoom(fakeStorage({ 'markdownInline.live.zoom': 'なにか' })), DEFAULT_ZOOM);
        });

        it('保存が使えない環境でも例外を投げない', () => {
            const broken = {
                getItem() {
                    throw new Error('denied');
                },
                setItem() {
                    throw new Error('denied');
                }
            };
            assert.strictEqual(readZoom(broken), DEFAULT_ZOOM);
            assert.doesNotThrow(() => writeZoom(broken, 1.5));
        });
    });
});
