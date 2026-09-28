/**
 * Live モードで Excel・Google スプレッドシートの範囲を貼り付けると Markdown の表になること（実 Chromium）。
 *
 * ユーザー要望（2026-09-28）:「Excel・スプレッドシートから表を貼り付け」を無料の既定機能にする。
 * スプレッドシートはクリップボードにタブ区切り（text/plain）と HTML の表（text/html）を両方入れるので、
 * それを模した paste イベントを CodeMirror の編集領域へ送る。変換の規則そのものは
 * `test/suite/shared/spreadsheetPaste.test.ts` が固定しており、ここでは「実際の貼り付けで起きるか」と
 * 「コードブロック内・コードのコピーでは起きないか」を見る。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openLive, type LiveHandle } from '../../liveBrowserHarness';

const TSV = '氏名\t年齢\r\n田中\t30\r\n';
const HTML_TABLE = '<table><tr><td>氏名</td><td>年齢</td></tr><tr><td>田中</td><td>30</td></tr></table>';
const TABLE = ['| 氏名 | 年齢 |', '| ---- | ---- |', '| 田中 | 30   |'].join('\n');

/** クリップボードの中身を持った paste イベントを編集領域へ送る。 */
async function paste(h: LiveHandle, text: string, html: string | null): Promise<void> {
    await h.page.evaluate(
        (clip) => {
            const dt = new DataTransfer();
            dt.setData('text/plain', clip.text);
            if (clip.html !== null) dt.setData('text/html', clip.html);
            const view = (window as unknown as { __liveView: { contentDOM: HTMLElement } }).__liveView;
            view.contentDOM.dispatchEvent(
                new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })
            );
        },
        { text, html }
    );
    await h.page.waitForTimeout(50);
}

describe('Live モード: スプレッドシートからの表の貼り付け（実ブラウザ）', function () {
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
            await h.close();
            h = undefined;
        }
    });

    it('空行に Excel の範囲を貼り付けると、Markdown の表になる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '見出し前\n\n\n');
        await h.setCursor('見出し前\n\n'.length);
        await paste(h, TSV, HTML_TABLE);
        assert.strictEqual(await h.doc(), `見出し前\n\n${TABLE}\n`);
    });

    it('段落の途中に貼り付けると、前後に空行を作って表を独立させる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, 'abcdef\n');
        await h.setCursor(3);
        await paste(h, TSV, HTML_TABLE);
        assert.strictEqual(await h.doc(), `abc\n\n${TABLE}\n\ndef\n`);
    });

    it('貼り付けた表は表として描画される', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '\n\n本文\n');
        await h.setCursor(0);
        await paste(h, TSV, HTML_TABLE);
        await h.setCursor((await h.doc()).length); // カーソルを表の外へ
        const cells = await h.page.evaluate<string[]>(
            `Array.from(document.querySelectorAll('.cm-content table td, .cm-content table th')).map((c) => c.textContent.trim())`
        );
        assert.deepStrictEqual(cells, ['氏名', '年齢', '田中', '30']);
    });

    it('VS Code 等からコピーしたコード（HTML はあるが表ではない）は、そのまま貼り付ける', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '\n');
        await h.setCursor(0);
        await paste(h, 'int\tx;\nint\ty;', '<div><span>int</span></div>');
        assert.strictEqual(await h.doc(), 'int\tx;\nint\ty;\n');
    });

    it('コードブロックの中に貼り付けたときは、表にせずタブ区切りのまま入れる', async function () {
        if (!browser) { this.skip(); return; }
        const doc = '```\n\n```\n';
        h = await openLive(browser, doc);
        await h.setCursor('```\n'.length);
        await paste(h, 'a\tb\nc\td', HTML_TABLE);
        assert.strictEqual(await h.doc(), '```\na\tb\nc\td\n```\n');
    });

    it('エラーが出ない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '\n');
        await h.setCursor(0);
        await paste(h, TSV, HTML_TABLE);
        assert.deepStrictEqual(h.errors, []);
    });
});
