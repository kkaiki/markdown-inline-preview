/**
 * 実ブラウザ回帰テスト: インライン記法（`**太字**` `*斜体*` `~~取り消し線~~` `` `コード` ``
 * `[link](url)`）の focus-expand（実テキスト編集化）。
 *
 * ## 背景
 *
 * 見出し・箇条書き・引用の行頭プレフィックス（`## ` 等）は `blockPrefixEditPlugin` が
 * フォーカス時に実テキストとして挿入し、そのまま Backspace で編集・削除できる。
 * 一方インライン記法マーカー（`**` 等）は `focusSyntaxPlugin` が `contenteditable="false"`
 * の widget として表示するだけで、実テキストではなく編集できなかった（手動確認で見つかった
 * 仕様ギャップ）。
 *
 * `inlineMarkEditPlugin` は、フォーカス中のブロック内にある対象マーク（strong / emphasis /
 * inlineCode / strike_through / link）を実テキストとして展開し、フォーカスが外れたら現在の
 * マーカー文字を読み取ってマークを再構築する。link は href（`](url)` の中身）も編集対象に
 * 含む（`docs/specifications/inline-mark-focus-edit-fix.md` 参照）。
 *
 * 実行: `npm run test:browser`。ブラウザが無い環境では skip。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openPreview, type PreviewHandle } from '../previewBrowserHarness';

describe('実ブラウザ: インライン記法マークの focus-expand（実テキスト編集化）', function () {
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

    it('太字にカーソルを合わせると "**" が実テキストとして表示される', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, 'これは **bold** です。\n', 'bold');

        // フォーカス前は doc に "**" は存在しない（strong マークとしてのみ保持される）。
        let model = await h.model();
        assert.ok(!model.text.includes('**'), `フォーカス前は "**" が実テキストに無いはず: ${JSON.stringify(model.text)}`);
        assert.ok(model.outline.includes('{strong}'), `strong マークが付いていない: ${model.outline}`);

        await h.placeCursorAfterText('bold');
        await h.page.waitForTimeout(150);
        model = await h.model();
        assert.ok(model.text.includes('**bold**'), `フォーカス中は "**bold**" が実テキストで見えるはず: ${JSON.stringify(model.text)}`);

        assert.deepStrictEqual(h.errors, []);
    });

    it('フォーカスを外すと実テキストの "**" は消え、太字マークは維持される（編集していないので change は増えない）', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, 'これは **bold** です。\n\n次の段落\n', 'bold');

        await h.placeCursorAfterText('bold');
        await h.page.waitForTimeout(150);
        await h.placeCursorAfterText('次の段落');
        await h.page.waitForTimeout(150);

        const model = await h.model();
        assert.ok(!model.text.includes('*'), `collapse 後は "*" が実文書に残ってはいけない: ${JSON.stringify(model.text)}`);
        assert.ok(model.outline.includes('{strong}'), `collapse 後も strong マークが維持されるはず: ${model.outline}`);
        // 何も編集していない往復なので、余計な change は送られないはず
        // （collapseMarkdownSync.test.ts の重複判定回帰と同じ前提）。
        assert.strictEqual(await h.lastChangeMarkdown(), null, '編集していないのに change が送られている');
        assert.deepStrictEqual(h.errors, []);
    });

    it('閉じ側の "**" から1文字 Backspace すると、フォーカスを外した時に太字ではなく斜体になる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, 'これは **bold** です。\n\n次の段落\n', 'bold');

        await h.placeCursorAfterText('bold');
        await h.page.waitForTimeout(150);
        // "bold" の直後（閉じ "**" の直前）にカーソルを置き、"**"（マークなしの別テキスト
        // ノード）の2文字分だけ右へ進めてから、閉じマーカーの直後で Backspace する。
        // "bold**" のように mark 境界をまたぐ文字列は同一テキストノード内検索の
        // placeCursorAfterText では見つからない（"bold" は strong マーク付き、"**" は
        // マーク無しの別ノードのため）。
        await h.press('ArrowRight');
        await h.press('ArrowRight');
        await h.press('Backspace'); // "**" → "*"（閉じマーカーを1文字減らす）
        await h.page.waitForTimeout(100);

        await h.placeCursorAfterText('次の段落');
        await h.page.waitForTimeout(150);

        const model = await h.model();
        assert.ok(!model.outline.includes('{strong}'), `閉じマーカーを1つ減らしたら strong ではなくなるはず: ${model.outline}`);
        assert.ok(model.outline.includes('{emphasis}'), `閉じマーカーを1つ減らしたら emphasis になるはず: ${model.outline}`);

        const md = await h.lastChangeMarkdown();
        assert.ok(md && md.includes('*bold*') && !md.includes('**bold**'), `保存 markdown が "*bold*" になっているはず: ${JSON.stringify(md)}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('"**" を両側とも全部消すと、フォーカスを外した時に太字ではなくなる（マーク除去）', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, 'これは **bold** です。\n\n次の段落\n', 'bold');

        await h.placeCursorAfterText('bold');
        await h.page.waitForTimeout(150);

        // 開き "**" を2回 Backspace で消す（"これは **" は同一マーク無しノードなので検索可能）。
        await h.placeCursorAfterText('これは **');
        await h.press('Backspace');
        await h.press('Backspace');
        // 閉じ "**" を2回 Backspace で消す（"bold" の直後から ArrowRight で境界を越える）。
        await h.placeCursorAfterText('bold');
        await h.press('ArrowRight');
        await h.press('ArrowRight');
        await h.press('Backspace');
        await h.press('Backspace');
        await h.page.waitForTimeout(100);

        await h.placeCursorAfterText('次の段落');
        await h.page.waitForTimeout(150);

        const model = await h.model();
        assert.ok(!model.outline.includes('{strong}') && !model.outline.includes('{emphasis}'),
            `マーカーを全部消したら装飾マークが無いはず: ${model.outline}`);
        assert.ok(model.text.includes('bold'), `本文の "bold" 自体は残るはず: ${JSON.stringify(model.text)}`);
        assert.ok(!model.text.includes('*'), `"*" が本文に残ってはいけない: ${JSON.stringify(model.text)}`);

        assert.deepStrictEqual(h.errors, []);
    });

    it('インラインコード `` ` `` も同様にフォーカス中は実テキストで見え、削除するとマークが外れる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, 'これは `code` です。\n\n次の段落\n', 'code');

        await h.placeCursorAfterText('code');
        await h.page.waitForTimeout(150);
        let model = await h.model();
        assert.ok(model.text.includes('`code`'), `フォーカス中は "\`code\`" が実テキストで見えるはず: ${JSON.stringify(model.text)}`);

        // "code" の直後（閉じ "`" の直前）から ArrowRight で境界を越えて Backspace。
        await h.press('ArrowRight');
        await h.press('Backspace');
        await h.placeCursorAfterText('これは `');
        await h.press('Backspace');
        await h.page.waitForTimeout(100);

        await h.placeCursorAfterText('次の段落');
        await h.page.waitForTimeout(150);
        model = await h.model();
        assert.ok(!model.outline.includes('{inlineCode}'), `バッククォートを全部消したら inlineCode マークは外れるはず: ${model.outline}`);
        assert.ok(!model.text.includes('`'), `バッククォートが本文に残ってはいけない: ${JSON.stringify(model.text)}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('取り消し線 `~~` も同様にフォーカス中は実テキストで見え、編集していなければ change は増えない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, 'これは ~~done~~ です。\n\n次の段落\n', 'done');

        await h.placeCursorAfterText('done');
        await h.page.waitForTimeout(150);
        let model = await h.model();
        assert.ok(model.text.includes('~~done~~'), `フォーカス中は "~~done~~" が実テキストで見えるはず: ${JSON.stringify(model.text)}`);

        await h.placeCursorAfterText('次の段落');
        await h.page.waitForTimeout(150);
        model = await h.model();
        assert.ok(!model.text.includes('~'), `collapse 後は "~" が実文書に残ってはいけない: ${JSON.stringify(model.text)}`);
        assert.ok(model.outline.includes('{strike_through}'), `collapse 後も strike_through マークが維持されるはず: ${model.outline}`);
        assert.strictEqual(await h.lastChangeMarkdown(), null, '編集していないのに change が送られている');
        assert.deepStrictEqual(h.errors, []);
    });

    it('リンクにカーソルを合わせると "[link](https://example.com)" が実テキストとして表示される', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, 'これは [link](https://example.com) です。\n', 'link');

        let model = await h.model();
        assert.ok(!model.text.includes('['), `フォーカス前は "[" が実テキストに無いはず: ${JSON.stringify(model.text)}`);
        assert.ok(model.outline.includes('{link}'), `link マークが付いていない: ${model.outline}`);

        await h.placeCursorAfterText('link');
        await h.page.waitForTimeout(150);
        model = await h.model();
        assert.ok(model.text.includes('[link](https://example.com)'), `フォーカス中は "[link](https://example.com)" が実テキストで見えるはず: ${JSON.stringify(model.text)}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('リンクのフォーカスを外すと実テキストの "[" "](url)" は消え、リンクは維持される（編集していないので change は増えない）', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, 'これは [link](https://example.com) です。\n\n次の段落\n', 'link');

        await h.placeCursorAfterText('link');
        await h.page.waitForTimeout(150);
        await h.placeCursorAfterText('次の段落');
        await h.page.waitForTimeout(150);

        const model = await h.model();
        assert.ok(!model.text.includes('[') && !model.text.includes(']'), `collapse 後は "[" "]" が実文書に残ってはいけない: ${JSON.stringify(model.text)}`);
        assert.ok(model.outline.includes('{link}'), `collapse 後も link マークが維持されるはず: ${model.outline}`);
        assert.strictEqual(await h.lastChangeMarkdown(), null, '編集していないのに change が送られている');
        assert.deepStrictEqual(h.errors, []);
    });

    it('リンクの URL 部分を打ち替えると、フォーカスを外した時に新しい href になる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, 'これは [link](https://example.com) です。\n\n次の段落\n', 'link');

        await h.placeCursorAfterText('link');
        await h.page.waitForTimeout(150);
        // "link](https://example.com" の直後（閉じ丸カッコの直前）にカーソルを移動し、
        // ".com" の4文字を Backspace で消してから ".jp" を打ち替える。
        await h.placeCursorAfterText('https://example.com');
        for (let i = 0; i < 4; i++) await h.press('Backspace'); // ".com" を削除
        await h.type('.jp');
        await h.page.waitForTimeout(100);

        await h.placeCursorAfterText('次の段落');
        await h.page.waitForTimeout(150);

        const model = await h.model();
        assert.ok(!model.text.includes('[') && !model.text.includes(']'), `collapse 後は "[" "]" が実文書に残ってはいけない: ${JSON.stringify(model.text)}`);
        assert.ok(model.outline.includes('{link}'), `href を打ち替えても link マーク自体は維持されるはず: ${model.outline}`);

        const md = await h.lastChangeMarkdown();
        assert.ok(md && md.includes('(https://example.jp)'), `保存 markdown の href が書き換わっているはず: ${JSON.stringify(md)}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('展開中のマーク内でテキストを選択しても view モードへ収縮せず、実テキストの "**" が見えたままになる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, 'これは **bold** です。\n', 'bold');

        await h.placeCursorAfterText('bold');
        await h.page.waitForTimeout(150);
        let model = await h.model();
        assert.ok(model.text.includes('**bold**'), `フォーカス中は "**bold**" が実テキストで見えるはず: ${JSON.stringify(model.text)}`);

        // 同じ太字テキスト内を選択（ドラッグ選択相当）しても、展開状態は維持されるはず。
        await h.selectText('bold');
        await h.page.waitForTimeout(150);
        model = await h.model();
        assert.ok(model.text.includes('**bold**'), `同じブロック内の選択では展開が維持されるはず: ${JSON.stringify(model.text)}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('太字以外（斜体・インラインコード・取り消し線・リンク）でも、展開中に選択しても収縮しない', async function () {
        if (!browser) { this.skip(); return; }

        h = await openPreview(browser, 'これは *emph* です。\n', 'emph');
        await h.placeCursorAfterText('emph');
        await h.page.waitForTimeout(150);
        await h.selectText('emph');
        await h.page.waitForTimeout(150);
        let model = await h.model();
        assert.ok(model.text.includes('*emph*'), `斜体: 選択中も展開が維持されるはず: ${JSON.stringify(model.text)}`);
        await h.close();

        h = await openPreview(browser, 'これは `code` です。\n', 'code');
        await h.placeCursorAfterText('code');
        await h.page.waitForTimeout(150);
        await h.selectText('code');
        await h.page.waitForTimeout(150);
        model = await h.model();
        assert.ok(model.text.includes('`code`'), `インラインコード: 選択中も展開が維持されるはず: ${JSON.stringify(model.text)}`);
        await h.close();

        h = await openPreview(browser, 'これは ~~done~~ です。\n', 'done');
        await h.placeCursorAfterText('done');
        await h.page.waitForTimeout(150);
        await h.selectText('done');
        await h.page.waitForTimeout(150);
        model = await h.model();
        assert.ok(model.text.includes('~~done~~'), `取り消し線: 選択中も展開が維持されるはず: ${JSON.stringify(model.text)}`);
        await h.close();

        h = await openPreview(browser, 'これは [link](https://example.com) です。\n', 'link');
        await h.placeCursorAfterText('link');
        await h.page.waitForTimeout(150);
        await h.selectText('link');
        await h.page.waitForTimeout(150);
        model = await h.model();
        assert.ok(model.text.includes('[link](https://example.com)'), `リンク: 選択中も展開が維持されるはず: ${JSON.stringify(model.text)}`);

        assert.deepStrictEqual(h.errors, []);
    });

    it('太字以外（斜体・インラインコード・取り消し線・リンク）でも、選択範囲がマーカー挿入で単一カーソルへ潰れない（選択して Backspace で選択部分だけ消える）', async function () {
        if (!browser) { this.skip(); return; }

        h = await openPreview(browser, 'これは *emph* です。\n', 'emph');
        await h.selectText('emph');
        await h.press('Backspace');
        let model = await h.model();
        assert.ok(!model.text.includes('emph'), `斜体: 選択範囲(emph)がまるごと消えるはず: ${JSON.stringify(model.text)}`);
        assert.ok(model.text.includes('これは') && model.text.includes('です。'), `斜体: 選択範囲以外は残るはず: ${JSON.stringify(model.text)}`);
        await h.close();

        h = await openPreview(browser, 'これは `code` です。\n', 'code');
        await h.selectText('code');
        await h.press('Backspace');
        model = await h.model();
        assert.ok(!model.text.includes('code'), `インラインコード: 選択範囲(code)がまるごと消えるはず: ${JSON.stringify(model.text)}`);
        assert.ok(model.text.includes('これは') && model.text.includes('です。'), `インラインコード: 選択範囲以外は残るはず: ${JSON.stringify(model.text)}`);
        await h.close();

        h = await openPreview(browser, 'これは ~~done~~ です。\n', 'done');
        await h.selectText('done');
        await h.press('Backspace');
        model = await h.model();
        assert.ok(!model.text.includes('done'), `取り消し線: 選択範囲(done)がまるごと消えるはず: ${JSON.stringify(model.text)}`);
        assert.ok(model.text.includes('これは') && model.text.includes('です。'), `取り消し線: 選択範囲以外は残るはず: ${JSON.stringify(model.text)}`);
        await h.close();

        h = await openPreview(browser, 'これは [link](https://example.com) です。\n', 'link');
        await h.selectText('link');
        await h.press('Backspace');
        model = await h.model();
        assert.ok(!model.text.includes('link'), `リンク: 選択範囲(link)がまるごと消えるはず: ${JSON.stringify(model.text)}`);
        assert.ok(model.text.includes('これは') && model.text.includes('です。'), `リンク: 選択範囲以外は残るはず: ${JSON.stringify(model.text)}`);

        assert.deepStrictEqual(h.errors, []);
    });

    it('リンクの "[" と "](url)" を両方全部消すと、フォーカスを外した時にリンクではなくなる（マーク除去）', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, 'これは [link](https://example.com) です。\n\n次の段落\n', 'link');

        await h.placeCursorAfterText('link');
        await h.page.waitForTimeout(150);

        // 開き "[" を1回 Backspace で消す。
        await h.placeCursorAfterText('これは [');
        await h.press('Backspace');
        // 閉じ "](https://example.com)" を全部 Backspace で消す。
        // "link" の直後（閉じ "]" の直前）から ArrowRight で閉じマーカー全体を
        // 通り過ぎてから、同じ文字数だけ Backspace で消す
        // （End だと段落末尾まで飛んでしまい " です。" まで消えてしまう）。
        await h.placeCursorAfterText('link');
        const closeLen = '](https://example.com)'.length;
        for (let i = 0; i < closeLen; i++) await h.press('ArrowRight');
        for (let i = 0; i < closeLen; i++) await h.press('Backspace');
        await h.page.waitForTimeout(100);

        await h.placeCursorAfterText('次の段落');
        await h.page.waitForTimeout(150);

        const model = await h.model();
        assert.ok(!model.outline.includes('{link}'), `マーカーを全部消したら link マークが無いはず: ${model.outline}`);
        assert.ok(model.text.includes('link'), `本文の "link" 自体は残るはず: ${JSON.stringify(model.text)}`);
        assert.ok(!model.text.includes('[') && !model.text.includes(']'), `"[" "]" が本文に残ってはいけない: ${JSON.stringify(model.text)}`);
        assert.deepStrictEqual(h.errors, []);
    });
});
