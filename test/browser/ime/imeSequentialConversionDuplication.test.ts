/**
 * 実ブラウザ回帰テスト: 同一段落内で日本語 IME 変換を複数回連続して確定したときの
 * 保存内容。
 *
 * ユーザー報告: 「このアプリで、Aという文章を編集しているとして、」のように、句読点を
 * 挟みながら一つの文をまとめて入力すると（＝IME 変換確定が段落内で複数回連続する）、
 * 冒頭の一部（例: 「このアプリで」）が二重に挿入されてしまう。既存の `imePersistence.test.ts`
 * は1段落につきIME変換確定が1回だけのケースしか検証しておらず、この「連続確定」の
 * 組み合わせは未検証だった。
 *
 * 本ファイルの各パターン（句読点を挟んだ連続確定・非IME直接タイプとの混在・既存段落末尾からの
 * 継続・待ち時間ゼロでの高速連続確定）はいずれも再現しなかった（実バグは見つからず、既存動作を
 * 仕様として固定する）。CDP（`Input.imeSetComposition`/`insertText`）によるシミュレーションでは
 * 再現しないため、実バグが実在するなら実 VS Code の Electron webview + 実 OS の日本語 IME 固有の
 * タイミング（本テスト基盤では再現できない領域）に起因する可能性が高い。
 *
 * 実行: `npm run test:browser`。ブラウザが無い環境では skip。
 */
import * as assert from 'assert';
import type { Browser, CDPSession } from 'playwright';
import { launchBrowser, openPreview, type PreviewHandle } from '../previewBrowserHarness';

describe('実ブラウザ: 同一段落内での連続 IME 変換確定', function () {
    this.timeout(120000);

    let browser: Browser | null = null;
    let h: PreviewHandle | undefined;

    before(async () => { browser = await launchBrowser(); });
    after(async function () { this.timeout(20000); await browser?.close(); });
    afterEach(async () => { if (h) { await h.close(); h = undefined; } });

    /** CDP で IME 変換確定をエミュレートする。 */
    async function imeCommit(handle: PreviewHandle, text: string): Promise<void> {
        const client: CDPSession = await handle.page.context().newCDPSession(handle.page);
        await client.send('Input.imeSetComposition', { text, selectionStart: text.length, selectionEnd: text.length });
        await handle.page.waitForTimeout(80);
        await client.send('Input.insertText', { text });
        await handle.page.waitForTimeout(120);
        await client.detach();
    }

    it('句読点を挟んで IME 変換を連続確定しても、冒頭が二重化しない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '\n', undefined);
        await h.focusEditor();

        await imeCommit(h, 'このアプリで');
        await imeCommit(h, '、');
        await imeCommit(h, 'Aという文章を編集しているとして');
        await imeCommit(h, '、');

        const m = await h.model();
        const expected = 'このアプリで、Aという文章を編集しているとして、';
        assert.strictEqual(m.text, expected, `テキストが壊れた: ${JSON.stringify(m.text)}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('句読点は直接タイプ（非IME）、それ以外はIME変換という組み合わせでも壊れない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '\n', undefined);
        await h.focusEditor();

        await imeCommit(h, 'このアプリで');
        await h.page.keyboard.type('、', { delay: 30 });
        await h.page.waitForTimeout(80);
        await imeCommit(h, 'Aという文章を編集しているとして');
        await h.page.keyboard.type('、', { delay: 30 });
        await h.page.waitForTimeout(80);

        const m = await h.model();
        const expected = 'このアプリで、Aという文章を編集しているとして、';
        assert.strictEqual(m.text, expected, `テキストが壊れた: ${JSON.stringify(m.text)}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('既存の段落の末尾（Enter で新規作成した段落）から続けて連続 IME 変換しても壊れない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '# 見出し\n\n既存の本文\n\nTAIL\n', 'TAIL');
        await h.placeCursorAfterText('既存の本文');
        await h.press('Enter');

        await imeCommit(h, 'このアプリで');
        await imeCommit(h, '、');
        await imeCommit(h, 'Aという文章を編集しているとして');
        await imeCommit(h, '、');

        const m = await h.model();
        assert.ok(m.text.includes('このアプリで、Aという文章を編集しているとして、'),
            `テキストが壊れた: ${JSON.stringify(m.text)}`);
        assert.ok(!m.text.includes('このアプリでこのアプリで'), `冒頭が二重化した: ${JSON.stringify(m.text)}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('待ち時間ゼロで複数の IME 変換確定を連続発行しても壊れない（極端な高速入力）', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '\n', undefined);
        await h.focusEditor();

        const client: CDPSession = await h.page.context().newCDPSession(h.page);
        const chunks = ['このアプリで', '、', 'Aという文章を編集しているとして', '、'];
        for (const chunk of chunks) {
            await client.send('Input.imeSetComposition', { text: chunk, selectionStart: chunk.length, selectionEnd: chunk.length });
            await client.send('Input.insertText', { text: chunk });
        }
        await client.detach();
        await h.page.waitForTimeout(300);

        const m = await h.model();
        const expected = 'このアプリで、Aという文章を編集しているとして、';
        assert.strictEqual(m.text, expected, `テキストが壊れた: ${JSON.stringify(m.text)}`);
        assert.deepStrictEqual(h.errors, []);
    });
});
