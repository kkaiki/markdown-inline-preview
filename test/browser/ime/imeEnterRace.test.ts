/**
 * 実ブラウザ回帰テスト: 日本語 IME 変換確定 Enter と改行 Enter のレース。
 *
 * ## バグの背景
 *
 * ProseMirror は「IME 変換確定の Enter が、そのまま改行挿入の Enter としても
 * 処理されてしまう」問題への対策（`inOrNearComposition`、prosemirror-view）を
 * 持っているが、**Safari 限定**の分岐でしか働かない
 * （`if (safari && Math.abs(Date.now() - view.input.compositionEndedAt) < 500)`）。
 * VS Code の Webview は Chromium/Electron なので、この対策の恩恵を受けられない。
 *
 * 結果、チェックボックス項目のテキストを日本語 IME で確定した直後に Enter を押すと:
 * 1. その Enter が「確定」だけでなく「改行」としても処理され、意図せず**空の
 *    list_item が split される**（ユーザーは気づかない）。
 * 2. ユーザーが「今度こそ改行」のつもりでもう一度 Enter を押すと、カーソルは
 *    **空の list_item 内**にいるため、ProseMirror 標準の「空リスト項目で Enter
 *    → リストから離脱」動作が発動し、**チェックボックスではないプレーン段落**に
 *    なってしまう（チェックボックスが次の行に反映されない）。
 *
 * 修正: `imeEnterGuard.ts` で、`compositionend` から 500ms 以内の最初の Enter を
 * 無視する（ProseMirror の Safari 分岐と同じ考え方をブラウザ非依存で行う）。
 *
 * 実行: `npm run test:browser`。ブラウザが無い環境では skip。
 */
import * as assert from 'assert';
import type { Browser, CDPSession } from 'playwright';
import { launchBrowser, openPreview, type PreviewHandle } from '../previewBrowserHarness';

describe('実ブラウザ: IME 確定 Enter と改行 Enter のレース', function () {
    this.timeout(120000);

    let browser: Browser | null = null;
    let h: PreviewHandle | undefined;

    before(async () => { browser = await launchBrowser(); });
    after(async function () { this.timeout(20000); await browser?.close(); });
    afterEach(async () => { if (h) { await h.close(); h = undefined; } });

    it('IME確定Enter直後の連打でも、チェックボックス項目のテキストが失われず次の行もチェックボックスになる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '\n', undefined);
        await h.focusEditor();
        await h.type('- [ ] ');

        const client: CDPSession = await h.page.context().newCDPSession(h.page);
        await client.send('Input.imeSetComposition', { text: 'かいもの', selectionStart: 4, selectionEnd: 4 });
        // insertText が compositionend を発火させ確定する。
        await client.send('Input.insertText', { text: 'かいもの' });
        // その直後（遅延なし）に IME 確定用の Enter を送る。
        // Safari 以外ではこの Enter が素通りして split を起こすのがバグの引き金。
        await client.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
        await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
        await h.page.waitForTimeout(150);

        // ユーザーが「今度こそ改行」のつもりで押す本物の Enter。
        await h.press('Enter');
        await h.type('次のタスク');

        const m = await h.model();
        assert.ok(
            m.outline.includes('list_item(checked=false)[paragraph["かいもの"]]'),
            `既存のチェックボックス項目のテキストが壊れている: ${m.outline}`
        );
        assert.ok(
            m.outline.includes('list_item(checked=false)[paragraph["次のタスク"]]'),
            `新しい行がチェックボックスとして継続されていない（プレーン段落になった可能性）: ${m.outline}`
        );
        assert.deepStrictEqual(h.errors, []);
    });

    it('composition confirmed WITHOUT Enter (space/click/auto-commit) does not swallow a later genuine Enter', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '\n', undefined);
        await h.focusEditor();
        await h.type('- [ ] ');

        const client: CDPSession = await h.page.context().newCDPSession(h.page);
        await client.send('Input.imeSetComposition', { text: 'かいもの', selectionStart: 4, selectionEnd: 4 });
        // 確定を Enter キーではなく insertText だけで行う（スペース/クリック/自動確定を模す）。
        // ここでは「確定用の Enter」自体が存在しないので、後続の Enter は完全に無関係な
        // 別の本物のキー入力のはず。
        await client.send('Input.insertText', { text: 'かいもの' });
        await h.page.waitForTimeout(150); // 500ms のガード窓の内側だが、確定Enterは無かった
        await h.press('Enter');
        await h.type('次のタスク');

        const m = await h.model();
        assert.ok(
            m.outline.includes('list_item(checked=false)[paragraph["次のタスク"]]'),
            `確定用 Enter を伴わない compositionend の後の本物の Enter が誤って無視された: ${m.outline}`
        );
        assert.deepStrictEqual(h.errors, []);
    });
});
