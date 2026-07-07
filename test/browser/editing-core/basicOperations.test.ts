/**
 * 実ブラウザ回帰テスト: Preview の基本操作を網羅的に検証する。
 *
 * 目的:
 *   - 各種 Markdown が **実バンドル（Milkdown + 実コンポーネント）**で正しく構造化されること
 *   - カーソルが触れても内容が壊れない（展開↔折りたたみのラウンドトリップ）こと
 *   - インライン整形（Cmd+B / Cmd+I）が効くこと
 *   - いずれの操作でも **page error が発生しない**こと（「すぐエラーが起きる」退行の防壁）
 *
 * jsdom（test/webview）では実レイアウト/コンポーネントが無く検出できない領域を守る。
 * 実行: `npm run test:browser`。ブラウザが無い環境では skip。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openPreview, type PreviewHandle } from '../previewBrowserHarness';

describe('実ブラウザ: Preview 基本操作の網羅', function () {
    this.timeout(90000);

    let browser: Browser | null = null;
    let h: PreviewHandle | undefined;

    before(async () => { browser = await launchBrowser(); });
    after(async () => { await browser?.close(); });
    afterEach(async () => { if (h) { await h.close(); h = undefined; } });

    // ───────────────────────────────────────────────────────────
    // 1) Markdown ロードと構造（パース）
    // ───────────────────────────────────────────────────────────
    describe('Markdown ロードと構造', () => {
        it('見出し H1〜H3 がレベル付きで構造化される', async function () {
            if (!browser) { this.skip(); return; }
            h = await openPreview(browser, '# One\n\n## Two\n\n### Three\n', 'Three');
            const m = await h.model();
            assert.deepStrictEqual(m.topTypes, ['heading', 'heading', 'heading']);
            assert.ok(m.outline.includes('heading(1)["One"]'), m.outline);
            assert.ok(m.outline.includes('heading(2)["Two"]'), m.outline);
            assert.ok(m.outline.includes('heading(3)["Three"]'), m.outline);
            assert.deepStrictEqual(h.errors, []);
        });

        it('箇条書きリストが bullet_list/list_item で構造化される', async function () {
            if (!browser) { this.skip(); return; }
            h = await openPreview(browser, '- alpha\n- beta\n- gamma\n', 'gamma');
            const m = await h.model();
            assert.deepStrictEqual(m.topTypes, ['bullet_list']);
            assert.ok(m.text.includes('alpha') && m.text.includes('beta') && m.text.includes('gamma'));
            assert.deepStrictEqual(h.errors, []);
        });

        it('番号付きリストが ordered_list で構造化される', async function () {
            if (!browser) { this.skip(); return; }
            h = await openPreview(browser, '1. one\n2. two\n3. three\n', 'three');
            const m = await h.model();
            assert.deepStrictEqual(m.topTypes, ['ordered_list']);
            assert.deepStrictEqual(h.errors, []);
        });

        it('チェックボックス（未/済）が checked 属性付きで構造化される', async function () {
            if (!browser) { this.skip(); return; }
            h = await openPreview(browser, '- [ ] todo\n- [x] done\n', 'done');
            const m = await h.model();
            assert.ok(m.outline.includes('checked=false'), m.outline);
            assert.ok(m.outline.includes('checked=true'), m.outline);
            assert.deepStrictEqual(h.errors, []);
        });

        it('ネストしたリストが入れ子で構造化される', async function () {
            if (!browser) { this.skip(); return; }
            h = await openPreview(browser, '- parent\n    - child\n', 'child');
            const m = await h.model();
            // bullet_list の中に bullet_list がある
            assert.ok(/bullet_list\[.*bullet_list\[/.test(m.outline), m.outline);
            assert.deepStrictEqual(h.errors, []);
        });

        it('引用が blockquote で構造化される', async function () {
            if (!browser) { this.skip(); return; }
            h = await openPreview(browser, '> quoted text\n', 'quoted text');
            const m = await h.model();
            assert.deepStrictEqual(m.topTypes, ['blockquote']);
            assert.deepStrictEqual(h.errors, []);
        });

        it('コードブロックが言語付きで構造化される', async function () {
            if (!browser) { this.skip(); return; }
            h = await openPreview(browser, '```js\nconst x = 1;\n```\n', 'const x');
            const m = await h.model();
            assert.deepStrictEqual(m.topTypes, ['code_block']);
            assert.ok(m.text.includes('const x = 1;'));
            assert.deepStrictEqual(h.errors, []);
        });

        it('インラインマーク（太字/斜体/コード/打消し）が構造化される', async function () {
            if (!browser) { this.skip(); return; }
            h = await openPreview(browser, 'a **bold** b *it* c `code` d ~~strike~~ e\n', 'bold');
            const m = await h.model();
            assert.ok(m.outline.includes('{strong}'), m.outline);
            assert.ok(m.outline.includes('{emphasis}'), m.outline);
            assert.ok(/\{.*inlineCode.*\}|\{.*code.*\}/.test(m.outline), m.outline);
            assert.ok(/\{.*strike_through.*\}|\{.*strikethrough.*\}/.test(m.outline), m.outline);
            assert.deepStrictEqual(h.errors, []);
        });

        it('リンクが link マーク付きで構造化される', async function () {
            if (!browser) { this.skip(); return; }
            h = await openPreview(browser, 'see [example](https://example.com) here\n', 'example');
            const m = await h.model();
            assert.ok(m.outline.includes('{link}'), m.outline);
            assert.deepStrictEqual(h.errors, []);
        });

        it('テーブルが table 構造で読み込める', async function () {
            if (!browser) { this.skip(); return; }
            h = await openPreview(browser, '| A | B |\n| - | - |\n| 1 | 2 |\n', 'A');
            const m = await h.model();
            assert.ok(m.topTypes.includes('table'), m.outline);
            assert.deepStrictEqual(h.errors, []);
        });

        it('水平線（hr）が読み込める', async function () {
            if (!browser) { this.skip(); return; }
            h = await openPreview(browser, 'above\n\n---\n\nbelow\n', 'below');
            const m = await h.model();
            assert.ok(m.topTypes.some((t) => t === 'hr' || t === 'horizontal_rule' || t === 'thematic_break'), m.outline);
            assert.deepStrictEqual(h.errors, []);
        });

        it('複合ドキュメント（見出し+リスト+コード+引用）がエラー無く読める', async function () {
            if (!browser) { this.skip(); return; }
            const md = '# Title\n\nintro paragraph\n\n- item one\n- [ ] task\n\n> note\n\n```py\nprint(1)\n```\n';
            h = await openPreview(browser, md, 'print(1)');
            const m = await h.model();
            assert.ok(m.topTypes.includes('heading'));
            assert.ok(m.topTypes.includes('bullet_list'));
            assert.ok(m.topTypes.includes('blockquote'));
            assert.ok(m.topTypes.includes('code_block'));
            assert.deepStrictEqual(h.errors, []);
        });
    });

    // ───────────────────────────────────────────────────────────
    // 2) 展開↔折りたたみのラウンドトリップ（カーソルが触れても内容が壊れない）
    // ───────────────────────────────────────────────────────────
    describe('カーソル進入→離脱で内容が壊れない（focus syntax ラウンドトリップ）', () => {
        /**
         * 行にカーソルを入れて（記法が実テキストに展開される）から別ブロックへ離脱し、
         * 折りたたみ後にテキスト内容が元と一致することを検証する。
         */
        async function roundtrip(markdown: string, lineText: string, _expectText: string): Promise<void> {
            if (!browser) return;
            h = await openPreview(browser, markdown, lineText);
            // ロード直後は先頭ブロックにカーソルがあり展開されていることがある。
            // まず TAIL へ逃がして「全ブロック折りたたみ」のクリーンな基準を取る。
            await h.placeCursorAtLineStart('TAIL ANCHOR');
            await h.page.waitForTimeout(150);
            const before = (await h.model()).text;
            await h.placeCursorAtLineStart(lineText); // 進入 → 展開
            await h.page.waitForTimeout(150);
            await h.placeCursorAtLineStart('TAIL ANCHOR'); // 離脱 → 折りたたみ
            await h.page.waitForTimeout(200);
            const after = (await h.model()).text;
            assert.strictEqual(after, before, `内容が壊れた: "${before}" → "${after}"`);
            assert.deepStrictEqual(h.errors, []);
        }

        it('見出しに入って出ても内容が保持される', async function () {
            if (!browser) { this.skip(); return; }
            await roundtrip('# My Heading\n\nTAIL ANCHOR\n', 'My Heading', 'My Heading');
        });

        it('箇条書きに入って出ても内容が保持される', async function () {
            if (!browser) { this.skip(); return; }
            await roundtrip('- list content here\n\nTAIL ANCHOR\n', 'list content here', 'list content');
        });

        it('番号付きに入って出ても内容が保持される', async function () {
            if (!browser) { this.skip(); return; }
            await roundtrip('1. ordered content\n\nTAIL ANCHOR\n', 'ordered content', 'ordered content');
        });

        it('引用に入って出ても内容が保持される', async function () {
            if (!browser) { this.skip(); return; }
            await roundtrip('> quoted content\n\nTAIL ANCHOR\n', 'quoted content', 'quoted content');
        });
    });

    // ───────────────────────────────────────────────────────────
    // 3) インライン整形（選択 → Cmd+B / Cmd+I）
    // ───────────────────────────────────────────────────────────
    describe('インライン整形ショートカット', () => {
        it('選択して Cmd+B で太字（strong）が付く', async function () {
            if (!browser) { this.skip(); return; }
            h = await openPreview(browser, 'make me bold please\n', 'make me bold');
            await h.selectText('bold');
            await h.press('Meta+b');
            const m = await h.model();
            assert.ok(m.outline.includes('"bold"{strong}'), m.outline);
            assert.deepStrictEqual(h.errors, []);
        });

        it('選択して Cmd+I で斜体（emphasis）が付く', async function () {
            if (!browser) { this.skip(); return; }
            h = await openPreview(browser, 'make me italic please\n', 'make me italic');
            await h.selectText('italic');
            await h.press('Meta+i');
            const m = await h.model();
            assert.ok(m.outline.includes('"italic"{emphasis}'), m.outline);
            assert.deepStrictEqual(h.errors, []);
        });

        it('太字を選択して Cmd+B で解除できる（トグル）', async function () {
            if (!browser) { this.skip(); return; }
            h = await openPreview(browser, 'already **strong** word\n', 'strong');
            await h.selectText('strong');
            await h.press('Meta+b');
            const m = await h.model();
            assert.ok(!m.outline.includes('"strong"{strong}'), `太字が解除されていない: ${m.outline}`);
            assert.deepStrictEqual(h.errors, []);
        });
    });
});
