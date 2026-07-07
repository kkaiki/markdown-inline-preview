/**
 * 実ブラウザ回帰テスト: IME（日本語変換）入力と、記法ブロック編集の保存内容。
 *
 * 日本語ユーザーが主対象のため、IME での編集が **保存 Markdown を壊さない**ことが重要。
 * jsdom では IME（composition）も blockPrefixEdit の rAF 展開も再現できないため、ここが唯一の砦。
 *
 * - IME 入力は CDP（`Input.imeSetComposition` + `Input.insertText`）でエミュレートする。
 * - 「ホストへ送られる最終 Markdown」は、編集→離脱の後に別ブロックを編集して change を
 *   発火させ、その内容で検証する（blockPrefixEdit は編集単独では即 change しないことがある）。
 *
 * 実行: `npm run test:browser`。ブラウザが無い環境では skip。
 */
import * as assert from 'assert';
import type { Browser, CDPSession } from 'playwright';
import { launchBrowser, openPreview, type PreviewHandle } from '../previewBrowserHarness';

describe('実ブラウザ: IME 入力と記法ブロックの保存内容', function () {
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
    }

    /** 編集→離脱の後、TAIL を編集して change を確実に発火させ、最終 Markdown を返す。 */
    async function finalMarkdownAfterEdit(handle: PreviewHandle): Promise<string> {
        await handle.placeCursorAtLineStart('TAIL');
        await handle.placeCursorAfterText('TAIL');
        await handle.type('Z');
        await handle.page.waitForTimeout(400);
        const md = await handle.lastChangeMarkdown();
        assert.ok(md !== null, 'change がホストに送られていない');
        return md;
    }

    it('IME: 段落に日本語を入力 → 保存 Markdown が正しい', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, 'Start\n\nTAIL\n', 'Start');
        await h.placeCursorAfterText('Start');
        await imeCommit(h, 'テスト');
        const md = await finalMarkdownAfterEdit(h);
        assert.ok(md.includes('Startテスト'), `日本語が反映されていない: ${JSON.stringify(md)}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('IME: 見出しに日本語を追記 → 保存 Markdown が正しい（# が二重化しない）', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '# Start\n\nTAIL\n', 'Start');
        await h.placeCursorAfterText('Start');
        await imeCommit(h, 'テスト');
        const md = await finalMarkdownAfterEdit(h);
        assert.ok(md.includes('# Startテスト'), `見出しが正しくない: ${JSON.stringify(md)}`);
        assert.ok(!md.includes('# #'), `見出しマーカーが二重化した: ${JSON.stringify(md)}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('IME: 箇条書きに日本語を追記 → 保存 Markdown が正しい（- が二重化しない）', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '- Start\n\nTAIL\n', 'Start');
        await h.placeCursorAfterText('Start');
        await imeCommit(h, 'てすと');
        const md = await finalMarkdownAfterEdit(h);
        assert.ok(md.includes('- Startてすと'), `箇条書きが正しくない: ${JSON.stringify(md)}`);
        assert.ok(!md.includes('- -'), `箇条書きマーカーが二重化した: ${JSON.stringify(md)}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('通常タイプ: 見出しに追記 → 保存 Markdown が正しい（# が二重化しない）', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '# Start\n\nTAIL\n', 'Start');
        await h.placeCursorAfterText('Start');
        await h.type('XYZ');
        const md = await finalMarkdownAfterEdit(h);
        assert.ok(md.includes('# StartXYZ'), `見出しが正しくない: ${JSON.stringify(md)}`);
        assert.ok(!md.includes('# #'), `見出しマーカーが二重化した: ${JSON.stringify(md)}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('blockPrefixEdit: 見出し⇄段落を高速に出入りしても内容・構造が壊れない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '# Heading one\n\nplain para\n\nTAIL\n', 'Heading one');
        for (let i = 0; i < 4; i++) {
            await h.placeCursorAtLineStart('Heading one');
            await h.placeCursorAtLineStart('plain para');
        }
        const m = await h.model();
        assert.ok(m.outline.includes('heading(1)["Heading one"]'), `見出しが壊れた: ${m.outline}`);
        assert.ok(m.outline.includes('paragraph["plain para"]'), `段落が壊れた: ${m.outline}`);
        assert.deepStrictEqual(h.errors, []);
    });
});
