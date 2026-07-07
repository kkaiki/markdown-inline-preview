/**
 * 実ブラウザ回帰テスト: 日本語 IME 変換中（未確定 = compositionend 前）に
 * 外部 update（Raw エディタ・AI 等の編集反映）が届いたときの挙動。
 *
 * test-directory-design.md §5 が挙げる「IME 変換中（未確定）に外部 update が届くケース」の
 * ギャップを埋める。`applyExternalContent`/`milkdownApp.ts` には現状 IME composition 中かどうかの
 * 判定が無く、変換中に届いた update がそのまま文書を書き換える。変換確定後にテキストが
 * 失われたり、意図しない場所に挿入されたりしないことを検証する。
 *
 * 実行: `npm run test:browser`。ブラウザが無い環境では skip。
 */
import * as assert from 'assert';
import type { Browser, CDPSession } from 'playwright';
import { launchBrowser, openPreview, type PreviewHandle } from '../previewBrowserHarness';

describe('実ブラウザ: IME 変換中に届く外部 update', function () {
    this.timeout(120000);

    let browser: Browser | null = null;
    let h: PreviewHandle | undefined;

    before(async () => { browser = await launchBrowser(); });
    after(async function () {
        this.timeout(60000);
        await Promise.race([
            browser?.close(),
            new Promise<void>(resolve => setTimeout(resolve, 55000))
        ]);
    });
    afterEach(async () => { if (h) { await h.close(); h = undefined; } });

    async function postUpdate(handle: PreviewHandle, markdown: string): Promise<void> {
        await handle.page.evaluate(
            (md) => window.postMessage({ type: 'update', markdown: md, frontmatter: null }, '*'),
            markdown
        );
        await handle.page.waitForTimeout(300);
    }

    it('変換中（未確定）に無関係な段落への外部 update が届いても、確定後に変換テキストが失われない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '一つ目の段落\n\nTAIL\n', 'TAIL');
        await h.placeCursorAfterText('TAIL');
        await h.press('Enter');

        const client: CDPSession = await h.page.context().newCDPSession(h.page);
        // 変換中（未確定）の状態を作る。
        await client.send('Input.imeSetComposition', { text: 'にほんご', selectionStart: 4, selectionEnd: 4 });
        await h.page.waitForTimeout(100);

        // 変換中に、編集中の段落とは無関係な箇所への外部 update が届く。
        await postUpdate(h, '一つ目の段落（外部編集済み）\n\nTAIL\n\n');

        // 変換を確定する。
        await client.send('Input.insertText', { text: 'にほんご' });
        await h.page.waitForTimeout(200);

        const m = await h.model();
        assert.ok(m.text.includes('外部編集済み'), `外部 update が反映されていない: ${m.text}`);
        assert.ok(m.text.includes('にほんご'),
            `変換中に届いた外部 update の後、確定した IME テキストが失われた: ${JSON.stringify(m.text)}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('変換中に届いた外部 update の後も、通常の入力を継続できる（クラッシュしない）', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, 'TAIL\n', 'TAIL');
        await h.placeCursorAfterText('TAIL');
        await h.press('Enter');

        const client: CDPSession = await h.page.context().newCDPSession(h.page);
        await client.send('Input.imeSetComposition', { text: 'てすと', selectionStart: 3, selectionEnd: 3 });
        await h.page.waitForTimeout(100);

        await postUpdate(h, 'TAIL\n\n短い外部変更\n');
        await client.send('Input.insertText', { text: 'てすと' });
        await h.page.waitForTimeout(200);

        // 確定後にさらに入力してもクラッシュしないこと。
        await h.type('続き');
        const m = await h.model();
        assert.ok(m.text.includes('短い外部変更'), `外部 update が反映されていない: ${m.text}`);
        assert.deepStrictEqual(h.errors, []);
    });
});
