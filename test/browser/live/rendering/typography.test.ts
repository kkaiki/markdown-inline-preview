/**
 * Live モードの「読みやすさ」を実 Chromium で固定する。
 *
 * ユーザー報告（2026-08-05）: 「引用が見えていなかったり、全体的に見た目がチープ」。
 * 見た目は主観だが、**チープに見える原因は数値で押さえられる**ものが多い:
 *   - 行間が詰まっている（line-height が 1.5 未満）
 *   - 本文が画面幅いっぱいに広がる（読み幅の上限が無い）
 *   - 見出しの前後に余白が無く、本文と同じ塊に見える
 *   - 引用の罫線が薄すぎて背景と区別がつかない／本文が薄すぎて読めない
 *   - チェックボックス行だけ本文の開始位置が箇条書きとずれる
 * ここではその数値をテストにして、以後の変更で退行しないようにする。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openLive, type LiveHandle } from '../../liveBrowserHarness';

/** sRGB の相対輝度。 */
function luminance(rgb: [number, number, number]): number {
    const [r, g, b] = rgb.map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG のコントラスト比。 */
function contrast(a: [number, number, number], b: [number, number, number]): number {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
}

function parseRgb(value: string): [number, number, number] {
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(value);
    assert.ok(m, `色として解釈できない: ${value}`);
    return [Number(m[1]), Number(m[2]), Number(m[3])];
}

const WHITE: [number, number, number] = [255, 255, 255];

describe('Live モード: 読みやすさ（実ブラウザ）', function () {
    this.timeout(120000);

    let browser: Browser | null = null;
    let h: LiveHandle | undefined;

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

    describe('本文の組版', () => {
        it('行間は 1.5 以上ある（詰まって見えない）', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, '本文です。\n');
            const ratio = await h.page.evaluate<number>(`(() => {
                const s = getComputedStyle(document.querySelector('.cm-content'));
                return parseFloat(s.lineHeight) / parseFloat(s.fontSize);
            })()`);
            assert.ok(ratio >= 1.5, `行間が詰まっている: ${ratio}`);
        });

        it('読み幅に上限があり、画面幅いっぱいに広がらない', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, `${'長い本文。'.repeat(80)}\n`);
            const w = await h.page.evaluate<{ content: number; viewport: number }>(`(() => ({
                content: document.querySelector('.cm-content').getBoundingClientRect().width,
                viewport: document.querySelector('.cm-scroller').getBoundingClientRect().width
            }))()`);
            assert.ok(w.content <= 800, `読み幅の上限が無い: ${w.content}px`);
            assert.ok(w.content < w.viewport, '本文がビューポート幅と同じで余白が無い');
        });

        it('画面が狭いときは本文が画面幅に収まり、横スクロールが出ない', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, `${'長い本文。'.repeat(40)}\n`);
            await h.page.setViewportSize({ width: 420, height: 500 });
            await h.page.waitForTimeout(150);
            const r = await h.page.evaluate<{ contentW: number; viewportW: number; overflow: boolean }>(`(() => {
                const s = document.querySelector('.cm-scroller');
                return {
                    contentW: document.querySelector('.cm-content').getBoundingClientRect().width,
                    viewportW: s.getBoundingClientRect().width,
                    overflow: s.scrollWidth > s.clientWidth + 1
                };
            })()`);
            assert.ok(r.contentW <= r.viewportW, `本文が画面からはみ出している: ${r.contentW} > ${r.viewportW}`);
            assert.strictEqual(r.overflow, false, '横スクロールが出ている');
        });

        it('画面が広いときは読み幅で頭打ちになり中央に寄る', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, '本文\n');
            await h.page.setViewportSize({ width: 1600, height: 500 });
            await h.page.waitForTimeout(150);
            const r = await h.page.evaluate<{ w: number; left: number; right: number }>(`(() => {
                const c = document.querySelector('.cm-content').getBoundingClientRect();
                const s = document.querySelector('.cm-scroller').getBoundingClientRect();
                return { w: c.width, left: c.x - s.x, right: s.right - c.right };
            })()`);
            assert.ok(r.w <= 800, `読み幅の上限が効いていない: ${r.w}px`);
            assert.ok(r.left > 100 && r.right > 100, `中央に寄っていない: 左${r.left} / 右${r.right}`);
            // ガターぶんのズレは許容するが、左右の差が読み幅の1割を超えたら偏りすぎ
            assert.ok(
                Math.abs(r.left - r.right) < 80,
                `左右の余白が偏っている: 左${r.left} / 右${r.right}`
            );
        });

        it('本文と背景のコントラストは十分にある', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, '本文です。\n');
            const fg = await h.page.evaluate<string>(`getComputedStyle(document.querySelector('.cm-content')).color`);
            assert.ok(contrast(parseRgb(fg), WHITE) >= 7, `本文のコントラストが低い: ${fg}`);
        });
    });

    describe('見出し', () => {
        it('見出しの上に本文より広い余白が入る', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, '本文\n\n## 見出し2\n\n本文\n');
            const pad = await h.page.evaluate<number>(
                `parseFloat(getComputedStyle(document.querySelector('.cm-live-heading')).paddingTop)`
            );
            assert.ok(pad >= 8, `見出しの上に余白が無い: ${pad}px`);
        });

        it('H1 と H2 の大きさに差がある', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, '# H1\n\n## H2\n');
            const sizes = await h.page.evaluate<number[]>(
                `['.cm-live-h1', '.cm-live-h2'].map(s => parseFloat(getComputedStyle(document.querySelector(s)).fontSize))`
            );
            assert.ok(sizes[0] > sizes[1], `H1 が H2 より大きくない: ${sizes.join(' / ')}`);
        });
    });

    describe('引用（ユーザー報告: 見えていない）', () => {
        it('左罫線が背景とはっきり区別できる', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, '> 引用の行\n\n本文\n');
            await h.setCursor(9);
            const border = await h.page.evaluate<{ color: string; width: number }>(`(() => {
                const s = getComputedStyle(document.querySelector('.cm-live-quote'));
                return { color: s.borderLeftColor, width: parseFloat(s.borderLeftWidth) };
            })()`);
            assert.ok(border.width >= 3, `罫線が細い: ${border.width}px`);
            const ratio = contrast(parseRgb(border.color), WHITE);
            assert.ok(ratio >= 3, `罫線が背景と区別できない（コントラスト ${ratio.toFixed(2)}）: ${border.color}`);
        });

        it('引用の本文が薄すぎない（本文と同等に読める）', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, '> 引用の行\n\n本文\n');
            await h.setCursor(9);
            const color = await h.page.evaluate<string>(
                `getComputedStyle(document.querySelector('.cm-live-quote')).color`
            );
            const ratio = contrast(parseRgb(color), WHITE);
            assert.ok(ratio >= 4.5, `引用の本文が薄い（コントラスト ${ratio.toFixed(2)}）: ${color}`);
        });

        it('引用ブロックに背景色が付いて塊として見える', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, '> 引用の行\n\n本文\n');
            await h.setCursor(9);
            const bg = await h.page.evaluate<string>(
                `getComputedStyle(document.querySelector('.cm-live-quote')).backgroundColor`
            );
            assert.notStrictEqual(bg, 'rgba(0, 0, 0, 0)', '引用に背景色が無い');
        });
    });

    describe('リストの見た目', () => {
        it('箇条書きの点が背景とはっきり区別できる', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, '- 箇条書き\n');
            const dot = await h.page.evaluate<{ bg: string; w: number }>(`(() => {
                const cs = getComputedStyle(document.querySelector('.cm-live-bullet'), '::after');
                return { bg: cs.backgroundColor, w: parseFloat(cs.width) };
            })()`);
            assert.ok(dot.w >= 4, `点が小さすぎる: ${dot.w}px`);
            const ratio = contrast(parseRgb(dot.bg), WHITE);
            assert.ok(ratio >= 3, `点が薄くて見えない（コントラスト ${ratio.toFixed(2)}）: ${dot.bg}`);
        });
    });

    describe('リストの揃え', () => {
        it('チェックボックス行の本文開始位置が箇条書き行と揃う', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, '- 箇条書き\n- [ ] タスク\n\n本文\n');
            await h.setCursor(20); // どちらの行にもカーソルを置かない
            // 「本文の1文字目」の x を測る。マーカー（"-" や チェックボックス）ではなく
            // 本文そのものの開始位置が揃っているかを見たいので、文字列で探す。
            const xs = await h.page.evaluate<number[]>(`(() => {
                const bodyX = (needle) => {
                    const walker = document.createTreeWalker(
                        document.querySelector('.cm-content'), NodeFilter.SHOW_TEXT);
                    let node;
                    while ((node = walker.nextNode())) {
                        const i = node.textContent.indexOf(needle);
                        if (i < 0) continue;
                        const r = document.createRange();
                        r.setStart(node, i);
                        r.setEnd(node, i + 1);
                        return r.getBoundingClientRect().left;
                    }
                    return -1;
                };
                return [bodyX('箇条書き'), bodyX('タスク')];
            })()`);
            assert.ok(xs[0] > 0 && xs[1] > 0, `本文位置が取得できない: ${xs.join(' / ')}`);
            assert.ok(
                Math.abs(xs[0] - xs[1]) <= 4,
                `箇条書きとチェックボックスで本文開始位置がずれている: ${xs[0].toFixed(1)} / ${xs[1].toFixed(1)}`
            );
        });
    });

    describe('コードブロック・表の仕上げ', () => {
        it('コードブロックは等幅フォントで背景と枠がある', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, 'あ\n\n```js\nconst a = 1;\n```\n');
            await h.setCursor(0);
            const s = await h.page.evaluate<{ font: string; bg: string; radius: string }>(`(() => {
                const el = document.querySelector('.cm-live-code-line');
                const cs = getComputedStyle(el);
                return { font: cs.fontFamily, bg: cs.backgroundColor, radius: cs.borderTopLeftRadius };
            })()`);
            assert.ok(/mono/i.test(s.font), `等幅フォントでない: ${s.font}`);
            assert.notStrictEqual(s.bg, 'rgba(0, 0, 0, 0)', 'コードブロックに背景が無い');
        });

        it('表のセルに十分なパディングがある', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, '| A | B |\n| --- | --- |\n| 1 | 2 |\n\n本文\n');
            await h.setCursor(35);
            const pad = await h.page.evaluate<number[]>(`(() => {
                const cs = getComputedStyle(document.querySelector('.cm-live-table td'));
                return [parseFloat(cs.paddingTop), parseFloat(cs.paddingLeft)];
            })()`);
            assert.ok(pad[0] >= 5 && pad[1] >= 8, `表のセルが詰まっている: ${pad.join(' / ')}`);
        });
    });
});
