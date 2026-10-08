/**
 * Live モードで画像を貼り付けると、host に保存を頼み、保存できたら `![](ファイル名)` が入ることを実 Chromium で固定する。
 *
 * ユーザー要望（2026-10-09）:「画像をペーストで自動で入れるようにして」。保存は host（md ファイルと同じ
 * ディレクトリ）が行い、webview は貼った位置を覚えておいて、返事を受けてから挿入する。
 * ここでは host の代わりに返事（`imageSaved`）を送って、webview 側の振る舞いだけを見る。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openLive, type LiveHandle } from '../../liveBrowserHarness';

interface PasteImageMessage {
    type: 'pasteImage';
    id: number;
    mime: string;
    name: string;
    data: string;
}

/** 1x1 の GIF を貼り付ける（text/plain は空）。 */
async function pasteGif(h: LiveHandle, text = ''): Promise<void> {
    await h.page.evaluate((plain: string) => {
        const bytes = Uint8Array.from(
            atob('R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw=='),
            (c) => c.charCodeAt(0)
        );
        const dt = new DataTransfer();
        dt.items.add(new File([bytes], 'image.gif', { type: 'image/gif' }));
        if (plain) dt.setData('text/plain', plain);
        const target = document.querySelector('.cm-content');
        target?.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    }, text);
    await h.page.waitForTimeout(200);
}

async function pasteMessages(h: LiveHandle): Promise<PasteImageMessage[]> {
    return (await h.sent()).filter((m) => m.type === 'pasteImage') as unknown as PasteImageMessage[];
}

describe('Live モード: 画像の貼り付け（実ブラウザ）', function () {
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
            assert.deepStrictEqual(h.errors, [], 'ページ内でエラーが出た');
            await h.close();
            h = undefined;
        }
    });

    it('画像を貼ると、host へ画像の中身（base64）と種類を送る', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '前\n\n後\n');
        await h.setCursor(2);
        await pasteGif(h);
        const sent = await pasteMessages(h);
        assert.strictEqual(sent.length, 1);
        assert.strictEqual(sent[0].mime, 'image/gif');
        assert.strictEqual(sent[0].name, 'image.gif');
        assert.ok(sent[0].data.startsWith('R0lGOD'), `base64 になっていない: ${sent[0].data.slice(0, 10)}`);
        // 保存の返事が来るまでは文書を変えない
        assert.strictEqual(await h.doc(), '前\n\n後\n');
    });

    it('host が保存できたら、貼った位置に ![](ファイル名) が入る', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '前\n\n後\n');
        await h.setCursor(2);
        await pasteGif(h);
        const [msg] = await pasteMessages(h);
        await h.page.evaluate((id: number) => {
            window.postMessage({ type: 'imageSaved', id, fileName: 'image-1.gif' }, '*');
        }, msg.id);
        await h.page.waitForTimeout(200);
        assert.strictEqual(await h.doc(), '前\n![](image-1.gif)\n後\n');
    });

    it('文字も一緒に入っているときは画像として扱わない（Excel の範囲など）', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '\n');
        await h.setCursor(0);
        await pasteGif(h, 'ただの文字');
        assert.strictEqual((await pasteMessages(h)).length, 0);
    });
});
