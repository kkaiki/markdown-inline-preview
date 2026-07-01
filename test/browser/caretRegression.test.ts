/**
 * 実ブラウザ回帰テスト: Preview のチェックボックス/リスト行頭 Backspace で
 * **カーソルが上の行へ飛ばない**ことを、実際の Chrome + 実バンドルで検証する。
 *
 * 背景 (regression):
 *   list-item-block コンポーネント（Web Component）はラベルを非同期再描画し、その際
 *   DOM キャレットを奪う。markerBackspace の pinSelection（2 段 rAF）で補正しているが、
 *   この不具合・修正は jsdom では再現できない。ここが唯一の防壁。
 *
 * 実行: `npm run test:browser`（事前に build:webview 必須）。
 * ブラウザ（Chrome/Chromium）が無い環境では skip する（CI を壊さない）。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openPreview, type PreviewHandle } from './previewBrowserHarness';

/** Backspace 後にキャレットがどれだけ上下したか（負 = 上へ飛んだ = 不具合）の許容値。 */
const JUMP_TOLERANCE_PX = 5;

describe('実ブラウザ回帰: Preview のキャレット保持（markerBackspace）', function () {
    // ブラウザ起動 + 描画待ちがあるので長めに。
    // ブラウザ起動・終了を含むため長め（他の browser テストと揃える）。
    this.timeout(120000);

    let browser: Browser | null = null;
    let h: PreviewHandle | undefined;

    before(async () => {
        browser = await launchBrowser();
    });
    after(async function () {
        this.timeout(20000);
        await browser?.close();
    });
    afterEach(async () => {
        if (h) {
            await h.close();
            h = undefined;
        }
    });

    /** 1 回 Backspace して「キャレットが上の行へ飛んでいない」ことを検証する共通処理。 */
    async function expectNoUpwardJump(markdown: string, lineText: string, presses = 1): Promise<void> {
        if (!browser) return; // skip 済み
        h = await openPreview(browser, markdown, lineText);
        await h.placeCursorAtLineStart(lineText);
        const before = await h.caretTop();
        assert.ok(before !== null, 'キャレット座標が取得できない（カーソルが置けていない）');
        for (let i = 0; i < presses; i++) await h.press('Backspace');
        const after = await h.caretTop();
        assert.ok(after !== null, 'Backspace 後のキャレット座標が取得できない');
        const dy = after - before;
        assert.ok(
            dy >= -JUMP_TOLERANCE_PX,
            `カーソルが上の行へ飛んだ（dy=${dy}px）。markerBackspace の pinSelection 回帰の疑い。`
        );
        assert.deepStrictEqual(h.errors, [], `ページ内でエラーが発生した: ${h.errors.join(' / ')}`);
    }

    it('前に段落があるチェックボックス行頭で Backspace してもカーソルが上に飛ばない', async function () {
        if (!browser) { this.skip(); return; }
        await expectNoUpwardJump('hello world paragraph\n\n- [ ] checkbox line\n', 'checkbox line');
    });

    it('リスト2番目のチェックボックスで Backspace してもカーソルが上の項目に飛ばない', async function () {
        if (!browser) { this.skip(); return; }
        await expectNoUpwardJump('- [ ] first item\n- [ ] second item\n', 'second item');
    });

    it('チェック済み [x] + 前に段落でも Backspace でカーソルが飛ばない', async function () {
        if (!browser) { this.skip(); return; }
        await expectNoUpwardJump('intro paragraph\n\n- [x] done item\n', 'done item');
    });

    it('通常の箇条書き（非チェックボックス）+ 前に段落でも飛ばない', async function () {
        if (!browser) { this.skip(); return; }
        await expectNoUpwardJump('intro line\n\n- plain bullet\n', 'plain bullet');
    });

    it('単独チェックボックス（前に行なし）で連続 Backspace しても飛ばない（回帰）', async function () {
        if (!browser) { this.skip(); return; }
        await expectNoUpwardJump('- [ ] solo task\n', 'solo task', 2);
    });
});
