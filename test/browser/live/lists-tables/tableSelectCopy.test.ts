/**
 * 表の中で ⌘A → ⌘C したとき、**選んだものが実際にクリップボードへ載る**ことを固定する。
 *
 * ユーザー報告（2026-08-10）:
 *   「表の全体と一つのセルは確認できましたが、1行は、コピーができなかった」
 *
 * 原因は、行・表全体の段階が DOM の選択を消して `.cm-live-cell-selected` クラスだけで
 * 選択を表していたこと。DOM に選択が無いとブラウザは `copy` イベントを発火しないので、
 * `wrap` に付けた copy ハンドラ（セルをタブ/改行区切りで書き出す）が**一度も呼ばれない**。
 *
 * ここでは「クリップボードに載る文字列」を copy イベントの setData を横取りして確かめる。
 * 選択の見た目（クラス）ではなく**コピーの結果**を見るのが要点。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openLive, type LiveHandle } from '../../liveBrowserHarness';

const TABLE = '| 項目 | 値 |\n| --- | --- |\n| 学生 | あいうえお |\n| 求人 | かきくけこ |\n\n本文\n';

/** n 番目（0 始まり）の編集可能セルへフォーカスしてキャレットを置く。 */
async function focusCell(h: LiveHandle, index: number): Promise<void> {
    await h.page.evaluate((i: number) => {
        const cells = Array.from(document.querySelectorAll('.cm-live-table [contenteditable="true"]'));
        const cell = cells[i] as HTMLElement;
        cell.focus();
        const range = document.createRange();
        range.selectNodeContents(cell);
        range.collapse(false);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
    }, index);
    await h.page.waitForTimeout(80);
}

/** ⌘C を押して、クリップボードへ載った文字列を返す（載らなければ null）。 */
async function copyAndRead(h: LiveHandle): Promise<string | null> {
    await h.page.evaluate(() => {
        const w = window as unknown as { __copied: string | null };
        w.__copied = null;
        document.addEventListener(
            'copy',
            (e: ClipboardEvent) => {
                const cd = e.clipboardData;
                if (!cd) return;
                const orig = cd.setData.bind(cd);
                cd.setData = (type: string, data: string): void => {
                    if (type === 'text/plain') w.__copied = data;
                    orig(type, data);
                };
            },
            true
        );
    });
    await h.press('Meta+c');
    await h.page.waitForTimeout(150);
    return h.page.evaluate<string | null>(`window.__copied`);
}

describe('Live モード: 表の段階選択とコピー（実ブラウザ）', function () {
    this.timeout(120000);

    let browser: Browser | null = null;
    let h: LiveHandle | undefined;

    before(async () => {
        browser = await launchBrowser();
    });
    after(async function () {
        // 全スイート連続実行では後始末（browser.close）が 20 秒に収まらず
        // "after all" hook がタイムアウトすることがある（2026-09-12）。
        this.timeout(60000);
        await browser?.close();
    });
    afterEach(async () => {
        if (h) {
            await h.close();
            h = undefined;
        }
    });

    it('セルを選ぶと、そのセルの中身が選択される（コピーはブラウザ既定に任せる）', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, TABLE);
        await focusCell(h, 3); // 「あいうえお」
        await h.press('Meta+a');
        assert.strictEqual(await h.page.evaluate<string>(`String(window.getSelection())`), 'あいうえお');
    });

    /*
     * 実 VS Code は ⌘A を本体でも処理して execCommand('selectAll') を送ってくる。
     * 表の中は**ウィジェット側**が ⌘A を処理しているので、これを通すと CodeMirror 側の
     * 段階選択も同時に走り、選択が二重に進む（実機で 3回目に DOM 選択が文書全体へ化けた）。
     */
    it('表の中では本体の selectAll が来ても、セルの選択が壊れない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, TABLE);
        await focusCell(h, 3);
        await h.press('Meta+a');
        await h.page.evaluate(`document.execCommand('selectAll')`);
        await h.page.waitForTimeout(100);
        assert.strictEqual(await h.page.evaluate<string>(`String(window.getSelection())`), 'あいうえお');
    });

    it('表の中では本体の selectAll が来ても、行の選択が壊れない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, TABLE);
        await focusCell(h, 3);
        await h.press('Meta+a');
        await h.press('Meta+a');
        await h.page.evaluate(`document.execCommand('selectAll')`);
        await h.page.waitForTimeout(100);
        assert.strictEqual(
            await h.page.evaluate<number>(`document.querySelectorAll('.cm-live-cell-selected').length`),
            2,
            '行のハイライトが消えている'
        );
    });

    it('表の中の ⌘A では CodeMirror 側の選択は動かない（二重に段階が進まない）', async function () {
        if (!browser) { this.skip(); return; }
        const handle = (h = await openLive(browser, TABLE));
        await focusCell(h, 3);
        const cmSel = async () =>
            handle.page.evaluate<{ from: number; to: number }>(
                `(() => { const s = window.__liveView.state.selection.main; return { from: s.from, to: s.to }; })()`
            );
        const before = await cmSel();
        for (let i = 0; i < 3; i++) {
            await h.press('Meta+a');
            // 本体が送ってくる selectAll をここで再現する
            await h.page.evaluate(`document.execCommand('selectAll')`);
            await h.page.waitForTimeout(80);
        }
        assert.deepStrictEqual(
            await cmSel(),
            before,
            '表の中の操作なのに CodeMirror 側の選択まで動いている'
        );
    });

    it('行を選んでコピーすると、その行のセルが載る', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, TABLE);
        await focusCell(h, 3);
        await h.press('Meta+a'); // セル
        await h.press('Meta+a'); // 行
        const copied = await copyAndRead(h);
        assert.ok(copied, 'クリップボードに何も載っていない（copy イベントが発火していない）');
        assert.ok(copied.includes('学生'), `行の内容が載っていない: ${JSON.stringify(copied)}`);
        assert.ok(copied.includes('あいうえお'), `行の内容が載っていない: ${JSON.stringify(copied)}`);
    });

    it('表全体を選んでコピーすると、すべての行が載る', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, TABLE);
        await focusCell(h, 3);
        await h.press('Meta+a'); // セル
        await h.press('Meta+a'); // 行
        await h.press('Meta+a'); // 表全体
        const copied = await copyAndRead(h);
        assert.ok(copied, 'クリップボードに何も載っていない（copy イベントが発火していない）');
        for (const word of ['項目', '学生', 'あいうえお', '求人', 'かきくけこ']) {
            assert.ok(copied.includes(word), `"${word}" が載っていない: ${JSON.stringify(copied)}`);
        }
    });

    it('行を選んだ状態でも、選択されている行は見た目でも分かる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, TABLE);
        await focusCell(h, 3);
        await h.press('Meta+a');
        await h.press('Meta+a');
        const n = await h.page.evaluate<number>(
            `document.querySelectorAll('.cm-live-cell-selected').length`
        );
        assert.strictEqual(n, 2, '行の2セルがハイライトされていない');
    });
});
