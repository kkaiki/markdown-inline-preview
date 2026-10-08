/**
 * Live モードで md ファイルと同じ場所にある画像（GIF を含む）が表示されることを実 Chromium で固定する。
 *
 * ユーザー報告（2026-10-09）:「画像のプレビューは入っている？ gif なども」→
 * `![](./cat.gif)` のような相対パスを解決せず、そのまま `<img src>` に入れていたので出なかった。
 * host が渡す md ファイルのディレクトリ（`settings.imageBaseUri`）を基準に解決する。
 * ここでは基準をフィクスチャとは別の一時ディレクトリにして、実際に画像が読み込まれること（naturalWidth）を見る。
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { pathToFileURL } from 'url';
import type { Browser } from 'playwright';
import { launchBrowser, openLive, type LiveHandle } from '../../liveBrowserHarness';

/** 1x1 の GIF。 */
const GIF = Buffer.from('R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64');

describe('Live モード: 手元の画像（実ブラウザ）', function () {
    this.timeout(120000);

    let browser: Browser | null = null;
    let h: LiveHandle | undefined;
    let dir = '';

    before(async () => {
        browser = await launchBrowser();
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'live-image-'));
        fs.writeFileSync(path.join(dir, 'cat.gif'), GIF);
        fs.mkdirSync(path.join(dir, 'img'));
        fs.writeFileSync(path.join(dir, 'img', 'dog.gif'), GIF);
    });
    after(async function () {
        this.timeout(60000);
        await browser?.close();
        fs.rmSync(dir, { recursive: true, force: true });
    });
    afterEach(async () => {
        if (h) {
            await h.close();
            h = undefined;
        }
    });

    /** 最初の画像が読み込まれた幅（読めなければ 0）。 */
    async function loadedWidth(handle: LiveHandle): Promise<number> {
        await handle.page.waitForTimeout(300);
        return handle.page.evaluate<number>(`(() => {
            const img = document.querySelector('img.cm-live-image');
            return img ? img.naturalWidth : -1;
        })()`);
    }

    it('md ファイルと同じ場所の GIF（./cat.gif）が表示される', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '![猫](./cat.gif)\n\n本文\n', {
            showLineNumbers: false,
            imageBaseUri: pathToFileURL(dir).href + '/'
        });
        await h.setCursor(await h.doc().then((d) => d.length - 1));
        assert.strictEqual(await loadedWidth(h), 1);
    });

    it('サブフォルダの画像（img/dog.gif）も表示される', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '![犬](img/dog.gif)\n\n本文\n', {
            showLineNumbers: false,
            imageBaseUri: pathToFileURL(dir).href + '/'
        });
        await h.setCursor(await h.doc().then((d) => d.length - 1));
        assert.strictEqual(await loadedWidth(h), 1);
    });
});
