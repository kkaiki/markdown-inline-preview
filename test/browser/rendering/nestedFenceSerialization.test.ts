/**
 * 実ブラウザ回帰テスト: 内容自体が `` ``` `` を含むコードブロック（ネストフェンス）の直列化。
 *
 * ## 背景
 *
 * コードブロックの内容が `` ``` `` で始まる/終わる場合、保存 Markdown ではフェンスを
 * 4 連バッククォートへ広げないと構造が壊れる。フォーカスしても Preview は記法を実テキスト
 * として挿入しない（`docs/specifications/no-focus-expand.md`）ので、フォーカスの前後で
 * 内容が変化しないこと、および編集しても外側フェンスが 4 連のまま維持されることを固定する。
 *
 * 実行: `npm run test:browser`。ブラウザが無い環境では skip。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openPreview, type PreviewHandle } from '../previewBrowserHarness';

describe('実ブラウザ: ネストフェンスを含むコードブロックの直列化', function () {
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

    it('内容の1行目が ``` で始まるコードブロックにフォーカスしても、同じフェンス行が二重に見えない', async function () {
        if (!browser) { this.skip(); return; }
        // 外側 ````tsx の中に ```tsx の例示が入ったネストフェンス。preview では内容の
        // ```tsx がそのまま見えており、フォーカスで外側フェンスを実テキスト挿入すると
        // 同一の ```tsx 行が2行並んでしまう（2026-07-13 ユーザー報告）。
        h = await openPreview(browser, '````tsx\n```tsx\nuseMouseEvents\nshowPageCorners\n````\n\n段落テキスト\n', '段落テキスト');

        const before = (await h.model()).text;
        assert.ok(before.includes('```tsx'), `preview 時点で内容の \`\`\`tsx が見えているはず: ${JSON.stringify(before)}`);

        await h.placeCursorAfterText('useMouseEvents');
        await h.page.waitForTimeout(150);
        const model = await h.model();
        assert.strictEqual(model.text, before, 'フォーカスしても実テキストは preview と同じまま（フェンスを二重表示しない）');
        assert.deepStrictEqual(h.errors, []);
    });

    it('内容の最終行が ``` のコードブロックでも、閉じフェンスが二重に見えない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '````\nhello\n```\n````\n\n段落テキスト\n', '段落テキスト');

        const before = (await h.model()).text;
        await h.placeCursorAfterText('hello');
        await h.page.waitForTimeout(150);
        const model = await h.model();
        assert.strictEqual(model.text, before, 'フォーカスしても実テキストは preview と同じまま（閉じフェンスを二重表示しない）');
        assert.deepStrictEqual(h.errors, []);
    });

    it('外側フェンスが4連バッククォートのブロックでは、表示されるフェンス行も4連になる', async function () {
        if (!browser) { this.skip(); return; }
        // 表示用のフェンス行（`.code-fence-display` widget）が常に ``` 固定だったため、
        // 内容の ``` と見分けがつかず「``` が2行並んで見た目が崩れる」状態だった
        // （2026-07-27 ユーザー報告のスクリーンショット）。ソースと同じ長さで出す。
        h = await openPreview(browser, '````tsx\n```tsx\nuseMouseEvents\n````\n\n段落テキスト\n', '段落テキスト');

        const fences = await h.page.$$eval('.milkdown .code-fence-display', (els) =>
            // widget は [行番号 span][フェンス文字列] の順。フェンス文字列だけを取り出す。
            els.map((el) => el.lastChild?.textContent ?? '')
        );
        assert.deepStrictEqual(
            fences,
            ['````tsx', '````'],
            `表示フェンスがソース（4連）と一致しない: ${JSON.stringify(fences)}`
        );
        assert.deepStrictEqual(h.errors, []);
    });

    it('通常のコードブロックの表示フェンスは3連バッククォートのまま', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '```js\nconst a = 1;\n```\n\n段落テキスト\n', '段落テキスト');

        const fences = await h.page.$$eval('.milkdown .code-fence-display', (els) =>
            els.map((el) => el.lastChild?.textContent ?? '')
        );
        assert.deepStrictEqual(fences, ['```js', '```'], `表示フェンスが3連でない: ${JSON.stringify(fences)}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('ネストフェンスのブロックは、フォーカス→離脱しても内容が変化せず change も送られない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '````tsx\n```tsx\nuseMouseEvents\nshowPageCorners\n````\n\n段落テキスト\n', '段落テキスト');

        const before = (await h.model()).text;
        await h.placeCursorAfterText('useMouseEvents');
        await h.page.waitForTimeout(150);
        await h.placeCursorAfterText('段落テキスト');
        await h.page.waitForTimeout(150);

        const model = await h.model();
        assert.strictEqual(model.text, before, 'フォーカスの出入りで内容が変わってはいけない');
        assert.strictEqual(model.topTypes[0], 'code_block', 'code_block のまま維持されるはず');
        assert.strictEqual(await h.lastChangeMarkdown(), null, '編集していないのに change が送られている');
        assert.deepStrictEqual(h.errors, []);
    });

    it('ネストフェンスのブロック内を編集しても、保存 markdown では外側フェンスが4連バッククォートのまま維持される', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '````tsx\n```tsx\nuseMouseEvents\nshowPageCorners\n````\n\n段落テキスト\n', '段落テキスト');

        await h.placeCursorAfterText('useMouseEvents');
        await h.page.waitForTimeout(150);
        await h.type('!');
        await h.page.waitForTimeout(100);
        await h.placeCursorAfterText('段落テキスト');
        await h.page.waitForTimeout(150);

        const md = await h.lastChangeMarkdown();
        assert.ok(md && md.includes('````tsx\n```tsx\nuseMouseEvents!\nshowPageCorners\n````'),
            `外側フェンスは \`\`\`\` のまま・内側 \`\`\`tsx は内容として維持されるはず: ${JSON.stringify(md)}`);
        assert.deepStrictEqual(h.errors, []);
    });
});
