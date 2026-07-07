/**
 * 実ブラウザ・ユースケーステスト: 日本語 IME とチェックボックスの組み合わせ。
 *
 * preview-usage-flow-test-backlog.md の「IME（日本語変換）でのチェックボックス変換」を
 * 消化するテスト。CDP（`Input.imeSetComposition` + `Input.insertText`）で本物の
 * IME 変換確定を再現する（手法は imeEnterRace.test.ts と同じ）。
 *
 * 検証すること:
 *   - チェックボックス項目の本文を IME で入力しても、項目・本文・保存 markdown が壊れない
 *   - 全角の疑似マーカー（［ｘ］等）はチェックボックスに誤変換されない
 *   - IME 確定直後にチェックボックスへ変換する操作（`] ` を後から打つ）でも変換される
 *
 * 実行: `npm run test:browser`。ブラウザが無い環境では skip。
 */
import * as assert from 'assert';
import type { Browser, CDPSession } from 'playwright';
import { launchBrowser, openPreview, type PreviewHandle } from '../previewBrowserHarness';

describe('実ブラウザ: IME とチェックボックスの組み合わせ', function () {
    this.timeout(120000);

    let browser: Browser | null = null;
    let h: PreviewHandle | undefined;

    before(async () => { browser = await launchBrowser(); });
    after(async function () { this.timeout(20000); await browser?.close(); });
    afterEach(async () => { if (h) { await h.close(); h = undefined; } });

    /** IME での変換確定を再現する（composition 開始 → insertText で確定）。 */
    async function imeCommit(handle: PreviewHandle, text: string): Promise<void> {
        const client: CDPSession = await handle.page.context().newCDPSession(handle.page);
        await client.send('Input.imeSetComposition', { text, selectionStart: text.length, selectionEnd: text.length });
        await client.send('Input.insertText', { text });
        await client.detach();
        await handle.page.waitForTimeout(200);
    }

    it('チェックボックス項目の本文を IME 確定で入力しても、項目と保存 markdown が壊れない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '\n', undefined);
        await h.focusEditor();
        await h.type('- [ ] ');
        await imeCommit(h, '買い物');

        const m = await h.model();
        assert.ok(m.outline.includes('list_item(checked=false)[paragraph["買い物"]]'),
            `IME 入力でチェックボックス項目が壊れた: ${m.outline}`);
        const md = await h.lastChangeMarkdown();
        assert.ok(md && /[-*+] \[ \] 買い物/.test(md), `保存 markdown が壊れた: ${md}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('IME 確定のあと半角の "] " を打ち足してもチェックボックスに変換される（確定→補完の流れ）', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '\n', undefined);
        await h.focusEditor();
        await h.type('- [x');
        // 日本語入力モードのまま確定だけした直後、半角に切り替えて "] " を打つ状況。
        await imeCommit(h, '');
        await h.type('] ');
        await h.type('done');
        await h.moveToEnd();

        const m = await h.model();
        assert.ok(m.outline.includes('list_item(checked=true)[paragraph["done"]]'),
            `IME 確定を挟むとチェックボックス変換が効かない: ${m.outline}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('全角の疑似マーカー（［ｘ］）はチェックボックスに誤変換されず、そのまま文字として残る', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '\n', undefined);
        await h.focusEditor();
        await h.type('- ');
        await imeCommit(h, '［ｘ］');
        await imeCommit(h, '全角マーカー');
        await h.moveToEnd();

        const m = await h.model();
        assert.ok(!m.outline.includes('checked=true'),
            `全角マーカーが誤ってチェックボックス化された: ${m.outline}`);
        assert.ok(m.text.includes('［ｘ］') && m.text.includes('全角マーカー'),
            `全角の入力が失われた: ${m.text}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('チェックボックスの変換トリガーとなる末尾スペース自体が IME 確定で入力されても変換される', async function () {
        if (!browser) { this.skip(); return; }
        // preview-usage-flow-test-backlog.md §4.1 のギャップ: typedCheckboxConversion.test.ts
        // の「日本語本文」ケースは h.type()（page.keyboard.type、1 文字ずつの実キーイベント）の
        // 文字送りのみで、GFM の wrapInTaskListInputRule を実際に発火させる「]」直後のスペース
        // 自体が IME の compositionend/insertText 経由で挿入された場合に同じ InputRule が
        // 反応するかは未検証だった（ProseMirror の inputRules は compositionend 由来の一括挿入と
        // 1 文字ずつの handleTextInput 経由の挿入とでコードパスが異なりうる）。
        h = await openPreview(browser, '\n', undefined);
        await h.focusEditor();
        await h.type('- [x]');
        // トリガーとなる末尾スペースを IME 確定として模す（imeCommit(' ') は
        // compositionstart→insertText(' ') の順で発火し、通常キー入力とは別経路を通る）。
        await imeCommit(h, ' ');
        await h.type('タスク');
        await h.moveToEnd();

        const m = await h.model();
        assert.ok(m.outline.includes('list_item(checked=true)[paragraph["タスク"]]'),
            `IME 確定によるトリガースペース入力でチェックボックス変換が効かない: ${m.outline}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('IME で見出しの本文を確定した直後に Enter しても、見出しが壊れず次は段落になる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '\n', undefined);
        await h.focusEditor();
        await h.type('## ');
        await imeCommit(h, '会議メモ');
        await h.page.waitForTimeout(300);
        await h.press('Enter');
        await h.type('honbun');
        await h.moveToEnd();

        const m = await h.model();
        assert.ok(m.outline.includes('heading(2)["会議メモ"]'),
            `IME 確定した見出しが壊れた: ${m.outline}`);
        assert.ok(m.outline.includes('paragraph["honbun"]'),
            `見出し直後の入力が段落にならない: ${m.outline}`);
        assert.deepStrictEqual(h.errors, []);
    });
});
