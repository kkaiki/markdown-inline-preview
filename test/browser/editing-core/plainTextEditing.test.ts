/**
 * 実ブラウザ回帰テスト: Preview の通常段落で最も頻繁に行う1文字編集を固定する。
 *
 * 実 Chromium の contenteditable へ実キーを送り、本文だけでなくProseMirror構造、
 * selection、hostへ送るMarkdown、page errorを同時に検証する。
 * 通常段落での文字入力・削除・改行（EDIT-001〜012）を実 Chromium で固定する。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openPreview, type PreviewHandle } from '../previewBrowserHarness';

describe('実ブラウザ: 通常段落の基本入力 EDIT-001〜012', function () {
    this.timeout(120000);

    let browser: Browser | null = null;
    let h: PreviewHandle | undefined;

    before(async () => { browser = await launchBrowser(); });
    after(async () => { await browser?.close(); });
    afterEach(async () => { if (h) { await h.close(); h = undefined; } });

    async function open(): Promise<PreviewHandle> {
        if (!browser) throw new Error('browser unavailable');
        h = await openPreview(browser, 'abcdef\n\nTAIL\n', 'abcdef');
        return h;
    }

    async function assertMarkdown(handle: PreviewHandle, expected: string): Promise<void> {
        await handle.waitForMarkdown(expected);
        assert.strictEqual(await handle.lastChangeMarkdown(), expected);
    }

    it('EDIT-001 通常段落の途中で1文字入力すると、前後を保ちカーソルが入力直後へ進む', async function () {
        if (!browser) { this.skip(); return; }
        const handle = await open();
        await handle.placeCursorBeforeText('def');
        const before = await handle.model();

        await handle.type('X');

        const after = await handle.model();
        assert.strictEqual(await handle.docText(), 'abcXdef\n\nTAIL');
        assert.strictEqual(after.selParentText, 'abcXdef');
        assert.strictEqual(after.selFrom, before.selFrom + 1, 'カーソルは入力した1文字ぶんだけ進む');
        assert.deepStrictEqual(after.topTypes, ['paragraph', 'paragraph', 'paragraph']);
        await assertMarkdown(handle, 'abcXdef\n\nTAIL\n');
        assert.deepStrictEqual(handle.errors, []);
        assert.deepStrictEqual(handle.consoleErrors, []);
    });

    it('EDIT-002 通常段落の先頭で1文字入力すると、その段落の先頭にだけ追加される', async function () {
        if (!browser) { this.skip(); return; }
        const handle = await open();
        await handle.placeCursorBeforeText('abcdef');
        const before = await handle.model();

        await handle.type('X');

        const after = await handle.model();
        assert.strictEqual(await handle.docText(), 'Xabcdef\n\nTAIL');
        assert.strictEqual(after.selParentText, 'Xabcdef');
        assert.strictEqual(after.selFrom, before.selFrom + 1);
        await assertMarkdown(handle, 'Xabcdef\n\nTAIL\n');
        assert.deepStrictEqual(handle.errors, []);
    });

    it('EDIT-003 通常段落の末尾で1文字入力すると、次の段落へ混入しない', async function () {
        if (!browser) { this.skip(); return; }
        const handle = await open();
        await handle.placeCursorAfterText('abcdef');
        const before = await handle.model();

        await handle.type('X');

        const after = await handle.model();
        assert.strictEqual(await handle.docText(), 'abcdefX\n\nTAIL');
        assert.strictEqual(after.selParentText, 'abcdefX');
        assert.strictEqual(after.selFrom, before.selFrom + 1);
        await assertMarkdown(handle, 'abcdefX\n\nTAIL\n');
        assert.deepStrictEqual(handle.errors, []);
    });

    it('EDIT-004 通常段落の途中へXYZを1文字ずつ入力しても欠落・重複しない', async function () {
        if (!browser) { this.skip(); return; }
        const handle = await open();
        await handle.placeCursorBeforeText('def');

        for (const [typed, expected] of [['X', 'abcXdef'], ['Y', 'abcXYdef'], ['Z', 'abcXYZdef']] as const) {
            await handle.type(typed);
            const model = await handle.model();
            assert.strictEqual(model.selParentText, expected);
            assert.strictEqual(await handle.docText(), `${expected}\n\nTAIL`);
        }
        await assertMarkdown(handle, 'abcXYZdef\n\nTAIL\n');
        assert.deepStrictEqual(handle.errors, []);
    });

    it('EDIT-005 通常段落の途中でBackspaceすると、直前の1文字だけを削除する', async function () {
        if (!browser) { this.skip(); return; }
        const handle = await open();
        await handle.placeCursorBeforeText('def');
        const before = await handle.model();

        await handle.press('Backspace');

        const after = await handle.model();
        assert.strictEqual(await handle.docText(), 'abdef\n\nTAIL');
        assert.strictEqual(after.selParentText, 'abdef');
        assert.strictEqual(after.selFrom, before.selFrom - 1);
        await assertMarkdown(handle, 'abdef\n\nTAIL\n');
        assert.deepStrictEqual(handle.errors, []);
    });

    it('EDIT-006 通常段落の途中でDeleteすると、直後の1文字だけを削除する', async function () {
        if (!browser) { this.skip(); return; }
        const handle = await open();
        await handle.placeCursorBeforeText('def');
        const before = await handle.model();

        await handle.press('Delete');

        const after = await handle.model();
        assert.strictEqual(await handle.docText(), 'abcef\n\nTAIL');
        assert.strictEqual(after.selParentText, 'abcef');
        assert.strictEqual(after.selFrom, before.selFrom);
        await assertMarkdown(handle, 'abcef\n\nTAIL\n');
        assert.deepStrictEqual(handle.errors, []);
    });

    it('EDIT-007 文書先頭でBackspaceしても本文・構造・カーソルを変更しない', async function () {
        if (!browser) { this.skip(); return; }
        const handle = await open();
        await handle.placeCursorBeforeText('abcdef');
        const before = await handle.model();

        await handle.press('Backspace');

        const after = await handle.model();
        assert.strictEqual(await handle.docText(), 'abcdef\n\nTAIL');
        assert.deepStrictEqual(after.topTypes, before.topTypes);
        assert.strictEqual(after.selFrom, before.selFrom);
        assert.strictEqual(await handle.lastChangeMarkdown(), null);
        assert.deepStrictEqual(handle.errors, []);
    });

    it('EDIT-008 文書末尾でDeleteしても本文・構造・カーソルを変更しない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, 'abcdef\n', 'abcdef');
        await h.placeCursorAfterText('abcdef');
        const before = await h.model();

        await h.press('Delete');

        const after = await h.model();
        assert.strictEqual(await h.docText(), 'abcdef');
        assert.deepStrictEqual(after.topTypes, before.topTypes);
        assert.strictEqual(after.selFrom, before.selFrom);
        assert.strictEqual(await h.lastChangeMarkdown(), null);
        assert.deepStrictEqual(h.errors, []);
    });

    it('EDIT-009 通常段落の途中でEnterすると、同じ段落内へ単一改行を入れる', async function () {
        if (!browser) { this.skip(); return; }
        const handle = await open();
        await handle.placeCursorBeforeText('def');

        await handle.press('Enter');

        const after = await handle.model();
        assert.strictEqual(await handle.docText(), 'abc\ndef\n\nTAIL');
        assert.deepStrictEqual(after.topTypes, ['paragraph', 'paragraph', 'paragraph']);
        assert.ok(after.outline.includes('paragraph["abc", hardbreak, "def"]'), after.outline);
        assert.strictEqual(after.selParentText, 'abc\ndef', 'hardbreakは同じparagraph内に残る');
        assert.strictEqual(await handle.currentLineText(), 'def');
        await assertMarkdown(handle, 'abc\\\ndef\n\nTAIL\n');
        assert.deepStrictEqual(handle.errors, []);
    });

    it('EDIT-010 通常段落の末尾でEnterすると、単一改行を1個だけ追加する', async function () {
        if (!browser) { this.skip(); return; }
        const handle = await open();
        await handle.placeCursorAfterText('abcdef');

        await handle.press('Enter');
        await handle.type('next');

        const after = await handle.model();
        assert.ok(after.outline.includes('paragraph["abcdef", hardbreak, "next"]'), after.outline);
        assert.strictEqual(await handle.currentLineText(), 'next');
        await assertMarkdown(handle, 'abcdef\\\nnext\n\nTAIL\n');
        assert.deepStrictEqual(handle.errors, []);
    });

    it('EDIT-012 通常段落の途中でShift+Enterすると、単一改行を1個だけ追加する', async function () {
        if (!browser) { this.skip(); return; }
        const handle = await open();
        await handle.placeCursorBeforeText('def');

        await handle.press('Shift+Enter');

        const after = await handle.model();
        assert.ok(after.outline.includes('paragraph["abc", hardbreak, "def"]'), after.outline);
        assert.strictEqual(await handle.currentLineText(), 'def');
        await assertMarkdown(handle, 'abc\\\ndef\n\nTAIL\n');
        assert.deepStrictEqual(handle.errors, []);
    });
});
