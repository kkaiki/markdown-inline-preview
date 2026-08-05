/**
 * 実ブラウザ回帰テスト: Preview からコピーした Markdown がソースと同じ形になること。
 *
 * Preview は空行をソースと 1:1 で空 paragraph として保持している
 * （`blank-line-preservation.md`）。この空 paragraph は remark-preserve-empty-line が
 * `<br />` プレースホルダとして直列化するため、ファイルへ書き戻す `postChange` は
 * `tightenListSpacing` → `stripPlaceholderLineBreaks` → `stripListItemPlaceholderBr` で
 * 正規化してから保存している。
 *
 * ところがクリップボード用の直列化（`clipboardPlainTextPlugin`）はこの正規化を通さず、
 * `<br />` を無条件に改行へ置換していたため、**コピーするたびに空行が増殖**していた
 * （ソースの空行1行 → 貼り付け先で4行。2026-07-27 ユーザー報告「コピーすると内容が
 * 崩れる」）。ここでは実ブラウザで copy イベントを発火させ、text/plain がソースと
 * 同じ Markdown になることを固定する。
 *
 * 実行: `npm run test:browser`。ブラウザが無い環境では skip。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openPreview, type PreviewHandle } from '../previewBrowserHarness';

/** 文書全体を選択して copy イベントを発火し、クリップボードの text/plain を返す。 */
async function copyWholeDoc(h: PreviewHandle): Promise<string> {
    return h.page.evaluate(() => {
        /* eslint-disable @typescript-eslint/no-explicit-any */
        const view = (window as any).__view;
        const Selection = Object.getPrototypeOf(view.state.selection.constructor);
        view.dispatch(view.state.tr.setSelection(
            Selection.fromJSON(view.state.doc, {
                type: 'text',
                anchor: 1,
                head: view.state.doc.content.size - 1
            })
        ));
        view.focus();
        const data = new DataTransfer();
        view.dom.dispatchEvent(new ClipboardEvent('copy', {
            bubbles: true, cancelable: true, clipboardData: data
        }));
        return data.getData('text/plain');
        /* eslint-enable @typescript-eslint/no-explicit-any */
    });
}

describe('実ブラウザ: Preview からコピーした Markdown の忠実性', function () {
    this.timeout(120000);

    let browser: Browser | null = null;
    let h: PreviewHandle | undefined;

    before(async () => { browser = await launchBrowser(); });
    after(async () => { await browser?.close(); });
    afterEach(async () => { if (h) { await h.close(); h = undefined; } });

    it('段落だけの文書をコピーしても空行が増えない', async function () {
        if (!browser) { this.skip(); return; }
        const src = '前の段落\n\n後の段落\n';
        h = await openPreview(browser, src, '後の段落');
        const copied = await copyWholeDoc(h);
        assert.strictEqual(
            copied.replace(/\n+$/, ''),
            src.replace(/\n+$/, ''),
            `コピー結果がソースと違う: ${JSON.stringify(copied)}`
        );
        assert.deepStrictEqual(h.errors, []);
    });

    it('コードブロックを含む文書をコピーしても空行が増えない', async function () {
        if (!browser) { this.skip(); return; }
        const src = '前の段落\n\n```\nAnimate the attached image.\nSecond line.\n```\n\n後の段落\n';
        h = await openPreview(browser, src, '後の段落');
        const copied = await copyWholeDoc(h);
        assert.strictEqual(
            copied.replace(/\n+$/, ''),
            src.replace(/\n+$/, ''),
            `コピー結果がソースと違う: ${JSON.stringify(copied)}`
        );
        assert.deepStrictEqual(h.errors, []);
    });

    it('連続した空行が2行ある文書でも、コピー結果の空行本数がソースと一致する', async function () {
        if (!browser) { this.skip(); return; }
        const src = '前の段落\n\n\n後の段落\n';
        h = await openPreview(browser, src, '後の段落');
        const copied = await copyWholeDoc(h);
        assert.strictEqual(
            copied.replace(/\n+$/, ''),
            src.replace(/\n+$/, ''),
            `空行の本数がソースと違う: ${JSON.stringify(copied)}`
        );
        assert.deepStrictEqual(h.errors, []);
    });
});
