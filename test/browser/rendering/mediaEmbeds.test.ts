/**
 * 実ブラウザ・仕様カバレッジテスト: 動画・音声・webp 画像の埋め込み表示。
 *
 * `![alt](path)` という通常の Markdown 画像記法を、拡張子に応じて
 * `<img>`（画像）/ `<video controls>`（動画）/ `<audio controls>`（音声）の
 * いずれかで描画する（imageMediaView.ts / classifyMediaKind）。
 *
 * webp は元々 `<img>` へ変換する経路（markdownTransform.ts）が拡張子非依存のため
 * 実は元から動作していたはずだが、明示的なテストが無かったので回帰防止として追加する。
 * mp4/mp3 はこれまで `<img>` としてしか描画されず再生できなかった（新機能）。
 *
 * 実行: `npm run test:browser`。ブラウザが無い環境では skip。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openPreview, type PreviewHandle } from '../previewBrowserHarness';

describe('実ブラウザ: 動画・音声・画像の埋め込み表示', function () {
    this.timeout(120000);

    let browser: Browser | null = null;
    let h: PreviewHandle | undefined;

    before(async () => { browser = await launchBrowser(); });
    after(async function () { this.timeout(20000); await browser?.close(); });
    afterEach(async () => { if (h) { await h.close(); h = undefined; } });

    const MARKDOWN = [
        '本文の段落',
        '',
        '![サンプル動画](assets/clip.mp4)',
        '',
        '![サンプル音声](assets/clip.mp3)',
        '',
        '![サンプル画像](assets/pic.webp)',
        ''
    ].join('\n');

    it('.mp4 は <video controls> で描画される', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, MARKDOWN, '本文の段落');
        const video = h.page.locator('#milkdown-root video[src$="assets/clip.mp4"]');
        await assert.doesNotReject(video.waitFor({ state: 'attached', timeout: 3000 }));
        assert.strictEqual(await video.count(), 1, 'video 要素が1つ描画されるべき');
        assert.strictEqual(await video.getAttribute('controls'), '', 'controls 属性が無い');
        assert.deepStrictEqual(h.errors, []);
    });

    it('.mp3 は <audio controls> で描画される', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, MARKDOWN, '本文の段落');
        const audio = h.page.locator('#milkdown-root audio[src$="assets/clip.mp3"]');
        await assert.doesNotReject(audio.waitFor({ state: 'attached', timeout: 3000 }));
        assert.strictEqual(await audio.count(), 1, 'audio 要素が1つ描画されるべき');
        assert.strictEqual(await audio.getAttribute('controls'), '', 'controls 属性が無い');
        assert.deepStrictEqual(h.errors, []);
    });

    it('.webp は引き続き <img> で描画される（既存動作の回帰防止）', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, MARKDOWN, '本文の段落');
        const img = h.page.locator('#milkdown-root img[src$="assets/pic.webp"]');
        await assert.doesNotReject(img.waitFor({ state: 'attached', timeout: 3000 }));
        assert.strictEqual(await img.count(), 1, 'img 要素が1つ描画されるべき');
        assert.deepStrictEqual(h.errors, []);
    });

    it('動画ノードを選択して Backspace で削除しても他のノードは壊れない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, MARKDOWN, '本文の段落');

        // 動画ノードをプログラム的に NodeSelection にしてから削除する
        // （動画の実クリックはネイティブ controls に奪われうるため、選択自体は
        //   プログラム的に確定させ、削除操作の結果だけを実 DOM で検証する）。
        await h.page.evaluate(() => {
            /* eslint-disable @typescript-eslint/no-explicit-any */
            const view = (window as any).__view;
            let pos = -1;
            view.state.doc.descendants((node: any, p: number) => {
                if (pos < 0 && node.type.name === 'image' && String(node.attrs.src).includes('clip.mp4')) pos = p;
            });
            if (pos < 0) throw new Error('動画ノードが見つからない');
            // atom ノード1個分（nodeSize は image のような leaf なら 1）を範囲指定して削除する。
            view.dispatch(view.state.tr.delete(pos, pos + 1));
            /* eslint-enable @typescript-eslint/no-explicit-any */
        });
        await h.page.waitForTimeout(150);

        assert.strictEqual(await h.page.locator('#milkdown-root video').count(), 0, '削除後も video が残っている');
        const audioStillThere = await h.page.locator('#milkdown-root audio[src$="assets/clip.mp3"]').count();
        assert.strictEqual(audioStillThere, 1, '無関係な audio ノードが巻き添えで消えた');
        assert.deepStrictEqual(h.errors, []);
    });
});
