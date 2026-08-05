/**
 * 実ブラウザ回帰テスト: コードブロックへフェンス付きテキストを貼り付けても二重フェンスにならない。
 *
 * ChatGPT 等からコピーしたコードは `` ``` `` フェンスごとクリップボードに入っていることが多い。
 * これを Preview の**コードブロックの中**へ貼り付けると、コードブロックの内容は常に
 * リテラルなので `` ``` `` が本文として入り込む。保存時には remark がその内容を包める長さ
 * （4連バッククォート）へ外側フェンスを広げるため、ファイルが二重フェンスになる:
 *
 * ````text
 * ````            ← 外側（保存時に広げられた）
 * ```             ← 貼り付けで本文に入ったフェンス
 * Animate ...
 * ```             ← 同上
 * ````
 * ````
 *
 * この状態になると Preview 上でフェンス行が4本並んで見え（`code-fence-display-length-fix.md`）、
 * コードブロック内で Cmd+A しても「中身」に `` ``` `` が含まれるためコピー結果にも入る
 * （2026-07-27 ユーザー報告）。貼り付け時点で外側フェンスを剥がして防ぐ。
 *
 * 実行: `npm run test:browser`。ブラウザが無い環境では skip。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openPreview, type PreviewHandle } from '../previewBrowserHarness';

describe('実ブラウザ: コードブロックへの貼り付けで二重フェンスを作らない', function () {
    this.timeout(120000);

    let browser: Browser | null = null;
    let h: PreviewHandle | undefined;

    before(async () => { browser = await launchBrowser(); });
    after(async () => { await browser?.close(); });
    afterEach(async () => { if (h) { await h.close(); h = undefined; } });

    it('コードブロックの中にフェンス付きテキストを貼り付けると、フェンスは剥がされて中身だけが入る', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '```\n\n```\n\n段落テキスト\n', '段落テキスト');
        await h.placeCursorAfterText('段落テキスト');
        await h.page.waitForTimeout(100);

        // 空のコードブロックへカーソルを移す（1つ目のブロックの内側）。
        await h.page.evaluate(() => {
            /* eslint-disable @typescript-eslint/no-explicit-any */
            const view = (window as any).__view;
            let pos = -1;
            view.state.doc.descendants((n: any, p: number) => {
                if (pos < 0 && n.type.name === 'code_block') pos = p + 1;
            });
            const Selection = Object.getPrototypeOf(view.state.selection.constructor);
            view.dispatch(view.state.tr.setSelection(
                Selection.fromJSON(view.state.doc, { type: 'text', anchor: pos, head: pos })
            ));
            view.focus();
            /* eslint-enable @typescript-eslint/no-explicit-any */
        });
        await h.pasteMarkdownText('```\nAnimate the attached image.\nSecond line.\n```');
        await h.page.waitForTimeout(250);

        const m = await h.model();
        assert.ok(
            !m.text.includes('```'),
            `コードブロックの本文にフェンスが入ってしまった: ${JSON.stringify(m.outline)}`
        );
        assert.ok(
            m.outline.includes('code_block["Animate the attached image.\\nSecond line."]'),
            `貼り付けた中身だけがコードブロックに入っていない: ${m.outline}`
        );
        assert.deepStrictEqual(h.errors, []);
    });

    it('言語付きフェンス（```js）を貼り付けてもフェンス行は本文に残らない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '```\n\n```\n\n段落テキスト\n', '段落テキスト');
        await h.page.evaluate(() => {
            /* eslint-disable @typescript-eslint/no-explicit-any */
            const view = (window as any).__view;
            let pos = -1;
            view.state.doc.descendants((n: any, p: number) => {
                if (pos < 0 && n.type.name === 'code_block') pos = p + 1;
            });
            const Selection = Object.getPrototypeOf(view.state.selection.constructor);
            view.dispatch(view.state.tr.setSelection(
                Selection.fromJSON(view.state.doc, { type: 'text', anchor: pos, head: pos })
            ));
            view.focus();
            /* eslint-enable @typescript-eslint/no-explicit-any */
        });
        await h.pasteMarkdownText('```js\nconst a = 1;\n```');
        await h.page.waitForTimeout(250);

        const m = await h.model();
        assert.ok(!m.text.includes('```'), `本文にフェンスが残った: ${m.outline}`);
        assert.ok(m.text.includes('const a = 1;'), `中身が入っていない: ${m.outline}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('フェンスを含まない普通のテキストの貼り付けは今までどおりそのまま入る', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '```\n\n```\n\n段落テキスト\n', '段落テキスト');
        await h.page.evaluate(() => {
            /* eslint-disable @typescript-eslint/no-explicit-any */
            const view = (window as any).__view;
            let pos = -1;
            view.state.doc.descendants((n: any, p: number) => {
                if (pos < 0 && n.type.name === 'code_block') pos = p + 1;
            });
            const Selection = Object.getPrototypeOf(view.state.selection.constructor);
            view.dispatch(view.state.tr.setSelection(
                Selection.fromJSON(view.state.doc, { type: 'text', anchor: pos, head: pos })
            ));
            view.focus();
            /* eslint-enable @typescript-eslint/no-explicit-any */
        });
        await h.pasteMarkdownText('plain code line\nsecond line');
        await h.page.waitForTimeout(250);

        const m = await h.model();
        assert.ok(
            m.outline.includes('code_block["plain code line\\nsecond line"]'),
            `普通のテキストの貼り付け結果が変わった: ${m.outline}`
        );
        assert.deepStrictEqual(h.errors, []);
    });

    it('コードブロックの外（段落）へフェンス付きテキストを貼ると、これまでどおりコードブロックとして取り込まれる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '段落A\n\n段落B\n', '段落B');
        await h.placeCursorAfterText('段落A');
        await h.press('Enter');
        await h.pasteMarkdownText('```\nAnimate the attached image.\n```');
        await h.page.waitForTimeout(250);

        const m = await h.model();
        assert.ok(
            m.outline.includes('code_block["Animate the attached image."]'),
            `段落への貼り付けがコードブロックにならない: ${m.outline}`
        );
        assert.ok(!m.text.includes('```'), `本文にフェンスが残った: ${m.outline}`);
        assert.deepStrictEqual(h.errors, []);
    });
});
