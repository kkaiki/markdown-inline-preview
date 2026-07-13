/**
 * 実ブラウザ回帰テスト: フェンスコードブロック（```lang` 〜 ```）のフォーカス時
 * 実テキスト編集化（`codeFenceEditPlugin`）。
 *
 * ## 背景
 *
 * これまでコードフェンスのバッククォート自体は `focusSyntaxPlugin` の
 * `Decoration.widget`（`contenteditable="false"`）として表示するだけで、実テキスト
 * ではなく編集（1文字ずつの打ち替え・削除）ができなかった（`code-fence-focus-markers.md`）。
 * 直列化時にバッククォートがコード本文へ紛れ込むリスクを理由に、意図的にこの制限を
 * 維持してきたが、見出し・インライン記法と同じように「``` の文字自体を1文字ずつ
 * 打ち替え・削除したい」というユーザー要望（2026-07-09）を受け、`blockPrefixEditPlugin`
 * と同じ「フォーカス中は実テキスト・フォーカスを外したら解析して反映」方式に変更した
 * （`code-fence-real-text-edit-fix.md` 参照）。
 *
 * 実行: `npm run test:browser`。ブラウザが無い環境では skip。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openPreview, type PreviewHandle } from '../previewBrowserHarness';

describe('実ブラウザ: コードフェンスの focus-expand（実テキスト編集化）', function () {
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

    it('コードブロックにフォーカスすると、開始・終了フェンスが実テキストとして見える', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '```js\nconst x = 1;\n```\n\n段落テキスト\n', '段落テキスト');

        let model = await h.model();
        assert.ok(!model.text.includes('```'), `フォーカス前は \`\`\` が実テキストに無いはず: ${JSON.stringify(model.text)}`);
        assert.strictEqual(model.topTypes[0], 'code_block');

        await h.placeCursorAfterText('const x = 1;');
        await h.page.waitForTimeout(150);
        model = await h.model();
        assert.ok(model.text.includes('```js\nconst x = 1;\n```'), `フォーカス中は \`\`\`js〜\`\`\` が実テキストで見えるはず: ${JSON.stringify(model.text)}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('フォーカスを外すと実テキストの ``` は消え、code_block・言語属性は維持される（編集していないので change は増えない）', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '```js\nconst x = 1;\n```\n\n段落テキスト\n', '段落テキスト');

        await h.placeCursorAfterText('const x = 1;');
        await h.page.waitForTimeout(150);
        await h.placeCursorAfterText('段落テキスト');
        await h.page.waitForTimeout(150);

        const model = await h.model();
        assert.ok(!model.text.includes('```'), `collapse 後は \`\`\` が実文書に残ってはいけない: ${JSON.stringify(model.text)}`);
        assert.strictEqual(model.topTypes[0], 'code_block', 'collapse 後も code_block のまま');
        assert.strictEqual(await h.lastChangeMarkdown(), null, '編集していないのに change が送られている');
        assert.deepStrictEqual(h.errors, []);
    });

    it('言語名部分を実テキストとして打ち替えると、フォーカスを外した時に新しい言語になる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '```js\nconst x = 1;\n```\n\n段落テキスト\n', '段落テキスト');

        await h.placeCursorAfterText('const x = 1;');
        await h.page.waitForTimeout(150);
        await h.placeCursorAfterText('```js');
        for (let i = 0; i < 2; i++) await h.press('Backspace'); // "js" を削除
        await h.type('ts');
        await h.page.waitForTimeout(100);

        await h.placeCursorAfterText('段落テキスト');
        await h.page.waitForTimeout(150);

        const model = await h.model();
        assert.ok(!model.text.includes('```'), `collapse 後は \`\`\` が実文書に残ってはいけない: ${JSON.stringify(model.text)}`);
        const md = await h.lastChangeMarkdown();
        assert.ok(md && md.includes('```ts\n'), `保存 markdown の言語が ts に変わっているはず: ${JSON.stringify(md)}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('開始フェンスの ``` を1文字 Backspace で削っても、フォーカス中は残りの文字がそのまま実テキストとして見える', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '```\nhello\n```\n\n段落テキスト\n', '段落テキスト');

        await h.placeCursorAfterText('hello');
        await h.page.waitForTimeout(150);
        await h.placeCursorAfterText('```');
        await h.press('Backspace');
        await h.page.waitForTimeout(100);

        const model = await h.model();
        assert.ok(model.text.includes('``\nhello\n```'), `1文字削っただけの状態がそのまま見えるはず: ${JSON.stringify(model.text)}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('開始フェンスの ``` を全部消してフォーカスを外すと、コードブロックではなく段落になる（中身のテキストは残る）', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '```\nhello world\n```\n\n段落テキスト\n', '段落テキスト');

        await h.placeCursorAfterText('hello world');
        await h.page.waitForTimeout(150);
        await h.placeCursorAfterText('```');
        await h.press('Backspace');
        await h.press('Backspace');
        await h.press('Backspace');
        await h.page.waitForTimeout(100);

        await h.placeCursorAfterText('段落テキスト');
        await h.page.waitForTimeout(150);

        const model = await h.model();
        assert.ok(!model.topTypes.includes('code_block'), `\`\`\` を全部消したら code_block ではなくなるはず: ${model.outline}`);
        assert.ok(model.text.includes('hello world'), `中身のテキストは残るはず: ${JSON.stringify(model.text)}`);
        assert.ok(!model.text.includes('```'), `\`\`\` が本文に残ってはいけない: ${JSON.stringify(model.text)}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('展開中のマーカーは装飾のみでなく実文書の一部だが、ホストへ送る保存 markdown には正しく1組の ``` だけが直列化される（二重化しない）', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '```js\nconst x = 1;\n```\n\n段落テキスト\n', '段落テキスト');

        await h.placeCursorAfterText('const x = 1;');
        await h.page.waitForTimeout(150);
        await h.type('!');
        await h.page.waitForTimeout(100);
        await h.placeCursorAfterText('段落テキスト');
        await h.page.waitForTimeout(150);

        const md = await h.lastChangeMarkdown();
        assert.strictEqual(md, '```js\nconst x = 1;!\n```\n\n段落テキスト\n');
        assert.deepStrictEqual(h.errors, []);
    });

    it('mermaid コードブロックはフォーカスしてもフェンスが実テキスト展開されない（図のパースを壊さないため対象外）', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '```mermaid\ngraph TD;\nA-->B;\n```\n\n段落テキスト\n', '段落テキスト');

        await h.placeCursorAfterText('A-->B;');
        await h.page.waitForTimeout(150);
        const model = await h.model();
        assert.ok(!model.text.includes('```'), `mermaid ブロックはフェンスを実テキスト展開しないはず: ${JSON.stringify(model.text)}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('内容の1行目が既に ``` で始まるコードブロック（ネストフェンス）は、フォーカスしても展開されず同じフェンス行が二重に見えない', async function () {
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

    it('内容の最終行が ``` のコードブロックも展開されず、閉じフェンスが二重に見えない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '````\nhello\n```\n````\n\n段落テキスト\n', '段落テキスト');

        const before = (await h.model()).text;
        await h.placeCursorAfterText('hello');
        await h.page.waitForTimeout(150);
        const model = await h.model();
        assert.strictEqual(model.text, before, 'フォーカスしても実テキストは preview と同じまま（閉じフェンスを二重表示しない）');
        assert.deepStrictEqual(h.errors, []);
    });

    it('展開対象外のネストフェンスブロックは、フォーカス→離脱しても内容が変化せず change も送られない（段落化やマーカー剥ぎ取りが起きない）', async function () {
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

    it('展開対象外のネストフェンスブロック内を編集すると、保存 markdown では外側フェンスが4連バッククォートのまま維持される', async function () {
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
