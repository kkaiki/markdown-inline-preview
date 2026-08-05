/**
 * Git 差分ガター（Phase 6b）の描画を実 Chromium で固定する。
 *
 * 最重要の不変条件は requirements.md 受け入れ基準 #9:
 *   **記法の展開/収縮ではドキュメントが変わらないので、カーソルを動かしただけで
 *   差分が変化してはならない。** 既存 Preview はここで実際に不具合を出している
 *   （`63d6074`: フォーカス展開しただけで青バーが立つ）。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openLive, type LiveHandle } from '../../liveBrowserHarness';

/** host から HEAD 本文を送る。 */
async function sendDiffBase(h: LiveHandle, text: string | null): Promise<void> {
    await h.page.evaluate((t: string | null) => {
        window.postMessage({ type: 'diffBase', text: t }, '*');
    }, text);
    await h.page.waitForTimeout(120);
}

/**
 * 差分マーカーが付いた行と種別の一覧（`3:modified` のような文字列）。
 * CodeMirror はマーカーの付いた行にしかガター要素を作らないので、
 * 「どの行に何が出ているか」で比較する。
 */
async function diffMarkers(h: LiveHandle): Promise<string[]> {
    return h.page.evaluate<string[]>(`(() => Array.from(document.querySelectorAll('.cm-live-diff')).map(bar => {
        const kind = bar.classList.contains('cm-live-diff-added') ? 'added'
            : bar.classList.contains('cm-live-diff-modified') ? 'modified' : 'deleted';
        return bar.dataset.line + ':' + kind;
    }))()`);
}

describe('Live モード: Git 差分ガター（実ブラウザ）', function () {
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

    it('HEAD を受け取るまでは何も表示しない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, 'a\nb\n');
        assert.deepStrictEqual(await diffMarkers(h), []);
    });

    it('HEAD と同じなら何も表示しない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, 'a\nb\n');
        await sendDiffBase(h, 'a\nb\n');
        assert.deepStrictEqual(await diffMarkers(h), []);
    });

    it('変更した行に青（modified）のバーが立つ', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, 'a\nB\nc\n');
        await sendDiffBase(h, 'a\nb\nc\n');
        assert.deepStrictEqual(await diffMarkers(h), ['2:modified']);
    });

    it('追加した行に緑（added）のバーが立つ', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, 'a\nb\nc\n');
        await sendDiffBase(h, 'a\nc\n');
        assert.deepStrictEqual(await diffMarkers(h), ['2:added']);
    });

    it('削除された位置に赤いマーカーが出る', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, 'a\nc\n');
        await sendDiffBase(h, 'a\nb\nc\n');
        assert.deepStrictEqual(await diffMarkers(h), ['2:deleted']);
    });

    it('git 管理外（HEAD が null）なら全行が追加扱い', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, 'a\nb\n');
        await sendDiffBase(h, null);
        assert.deepStrictEqual(await diffMarkers(h), ['1:added', '2:added', '3:added']);
    });

    it('記法の展開/収縮では差分が変わらない（受け入れ基準 #9）', async function () {
        if (!browser) { this.skip(); return; }
        const doc = '# 見出し\n\n**太字**の段落\n';
        h = await openLive(browser, doc);
        await sendDiffBase(h, doc);
        const before = await diffMarkers(h);
        // 記法を展開/収縮させる操作を一通り行う
        await h.setCursor(2); // 見出しを展開
        await h.setCursor(8); // 太字トークンへ
        await h.blur(); // 全収縮
        await h.focus();
        const after = await diffMarkers(h);
        assert.deepStrictEqual(after, before, 'カーソル移動だけで差分が変わった');
        assert.deepStrictEqual(after, [], '変更していないのに差分が出ている');
    });

    it('実際に編集した行だけが差分になる', async function () {
        if (!browser) { this.skip(); return; }
        const doc = 'a\nb\nc\n';
        h = await openLive(browser, doc);
        await sendDiffBase(h, doc);
        await h.setCursor(3);
        await h.type('X');
        assert.strictEqual(await h.doc(), 'a\nbX\nc\n');
        assert.deepStrictEqual(await diffMarkers(h), ['2:modified']);
    });

    it('畳まれた表の行にも差分が出る', async function () {
        if (!browser) { this.skip(); return; }
        const head = '前\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n';
        const now = '前\n\n| A | Z |\n| --- | --- |\n| 1 | 2 |\n';
        h = await openLive(browser, now);
        await sendDiffBase(h, head);
        const markers = await diffMarkers(h);
        assert.ok(
            markers.some((m) => m.endsWith(':modified')),
            `表の差分が出ていない: ${JSON.stringify(markers)}`
        );
    });
});
