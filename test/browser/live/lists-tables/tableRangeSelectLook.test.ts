/**
 * 表のセルをドラッグで範囲選択したときの見た目を実 Chromium で固定する。
 *
 * 何を: 選択したセルはどれも同じ「選択色」で塗られ、ホバー中の行の色やドラッグを始めた
 *       セルのフォーカス枠に上書きされないこと。選択していないセルとは色ではっきり区別できること。
 * なぜ: ユーザー報告（2026-10-02）「ホバーと、ドラッグしているところが重なってよくわからない」。
 *       行ホバーの CSS のほうが詳細度が高く選択色を消し、開始セルには青い枠が残っていた。
 * どの層で: computed style と実マウスのホバーが要るので実ブラウザ。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openLive, type LiveHandle } from '../../liveBrowserHarness';

const TABLE =
    '| 判定 | 社数 | 主な理由 |\n| --- | --- | --- |\n| A | 3,651 | HPが消えている |\n| B | 4,207 | 1〜2年更新なし |\n| C | 5,987 | 比較的新しい |\n';

/** セル i（DOM 順）からセル j までドラッグする。`release` が false ならボタンを押したまま。 */
async function dragCells(h: LiveHandle, from: number, to: number, release = true): Promise<void> {
    const box = await h.page.evaluate<{ fx: number; fy: number; tx: number; ty: number }>(
        `(() => {
            const cells = Array.from(document.querySelectorAll('.cm-live-table [contenteditable="true"]'));
            const a = cells[${from}].getBoundingClientRect();
            const b = cells[${to}].getBoundingClientRect();
            return { fx: a.x + a.width / 2, fy: a.y + a.height / 2, tx: b.x + b.width / 2, ty: b.y + b.height / 2 };
        })()`
    );
    await h.page.mouse.move(box.fx, box.fy);
    await h.page.mouse.down();
    await h.page.mouse.move(box.tx, box.ty, { steps: 6 });
    if (release) await h.page.mouse.up();
    await h.page.waitForTimeout(150);
}

interface CellLook {
    index: number;
    selected: boolean;
    background: string;
    boxShadow: string;
}

async function cellLooks(h: LiveHandle): Promise<CellLook[]> {
    return h.page.evaluate(() =>
        Array.from(document.querySelectorAll<HTMLElement>('.cm-live-table [contenteditable="true"]')).map(
            (el, index) => {
                const cs = getComputedStyle(el);
                return {
                    index,
                    selected: el.classList.contains('cm-live-cell-selected'),
                    background: cs.backgroundColor,
                    boxShadow: cs.boxShadow
                };
            }
        )
    );
}

describe('Live モード: 表の範囲選択の見た目（実ブラウザ）', function () {
    this.timeout(120000);

    let browser: Browser | null = null;
    let h: LiveHandle | undefined;

    before(async () => {
        browser = await launchBrowser();
    });
    after(async function () {
        this.timeout(60000);
        await browser?.close();
    });
    afterEach(async () => {
        if (h) {
            await h.close();
            h = undefined;
        }
    });

    for (const release of [false, true]) {
        const when = release ? 'ドラッグを終えたあと' : 'ドラッグ中';
        it(`${when}も、選択したセルはホバー中の行でも同じ選択色で塗られる`, async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, TABLE);
            // 本文1行目「A」(3) から 本文2行目「4,207」(7) まで。マウスは選択内の行に乗ったまま
            await dragCells(h, 3, 7, release);
            const looks = await cellLooks(h);
            const selected = looks.filter((l) => l.selected);
            assert.deepStrictEqual(selected.map((l) => l.index), [3, 4, 6, 7]);
            const colors = new Set(selected.map((l) => l.background));
            assert.strictEqual(colors.size, 1, `選択セルの色がそろっていない: ${JSON.stringify(selected)}`);
            const unselected = looks.filter((l) => !l.selected);
            for (const u of unselected) {
                assert.notStrictEqual(u.background, selected[0].background, `未選択セル ${u.index} が選択色と同じ`);
            }
            if (!release) await h.page.mouse.up();
        });

        it(`${when}は、ドラッグを始めたセルにフォーカス枠を出さない`, async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, TABLE);
            await dragCells(h, 3, 7, release);
            const looks = await cellLooks(h);
            const ringed = looks.filter((l) => l.boxShadow !== 'none' && !l.boxShadow.includes('0px 0px 0px 0px'));
            const selectedShadows = new Set(looks.filter((l) => l.selected).map((l) => l.boxShadow));
            // 選択セルに枠を付けるなら全セル同じであること。未選択セルに枠は付かないこと。
            assert.strictEqual(selectedShadows.size, 1, `選択セルの枠がそろっていない: ${JSON.stringify(looks)}`);
            assert.ok(
                ringed.every((l) => l.selected),
                `未選択セルに枠が出ている: ${JSON.stringify(ringed)}`
            );
            if (!release) await h.page.mouse.up();
        });
    }

    it('選択していないときは、従来どおり行ホバーとフォーカス枠が出る', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, TABLE);
        await dragCells(h, 4, 4); // 単一セルのクリック
        const looks = await cellLooks(h);
        assert.strictEqual(looks.filter((l) => l.selected).length, 0);
        assert.notStrictEqual(looks[4].boxShadow, 'none', 'フォーカス枠が出ていない');
    });
});
