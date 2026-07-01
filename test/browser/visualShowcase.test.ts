/**
 * 実ブラウザ「視覚確認」スクリーンショット撮影。
 *
 * 各種 Markdown を実バンドルでレンダリングしてスクリーンショットを test-screenshots/ に保存する。
 * - 開発者（および AI）が画像を目視して、レイアウト崩れ・記号欠落・装飾の異常を発見する。
 * - `HEADED=1 npm run test:browser` で実ブラウザ画面を見ながら実行できる。
 *
 * これ自体はアサーションが緩い（page error が無いことのみ）。視覚的退行の「観測点」を作るのが目的。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openPreview, type PreviewHandle } from './previewBrowserHarness';

describe('実ブラウザ: 視覚確認スクリーンショット', function () {
    this.timeout(90000);

    let browser: Browser | null = null;
    let h: PreviewHandle | undefined;

    before(async () => { browser = await launchBrowser(); });
    after(async () => { await browser?.close(); });
    afterEach(async () => { if (h) { await h.close(); h = undefined; } });

    async function shoot(name: string, markdown: string, expectText: string): Promise<void> {
        if (!browser) return;
        h = await openPreview(browser, markdown, expectText);
        await h.page.waitForTimeout(300);
        const file = await h.screenshot(name);
        console.log(`  📸 ${name} → ${file}`);
        assert.deepStrictEqual(h.errors, [], `${name} でエラー: ${h.errors.join(' / ')}`);
    }

    it('見出しレベル', async function () {
        if (!browser) { this.skip(); return; }
        await shoot('01-headings', '# H1 見出し\n\n## H2 見出し\n\n### H3 見出し\n\n#### H4\n\n##### H5\n\n###### H6\n', 'H6');
    });

    it('リストとチェックボックス', async function () {
        if (!browser) { this.skip(); return; }
        await shoot('02-lists',
            '- 箇条書き 1\n- 箇条書き 2\n    - ネスト 2-1\n    - ネスト 2-2\n\n1. 番号 1\n2. 番号 2\n\n- [ ] 未完了タスク\n- [x] 完了タスク\n',
            '完了タスク');
    });

    it('インライン装飾', async function () {
        if (!browser) { this.skip(); return; }
        await shoot('03-inline',
            'これは **太字** と *斜体* と `インラインコード` と ~~打消し~~ と [リンク](https://example.com) です。\n',
            'リンク');
    });

    it('引用とコードブロック', async function () {
        if (!browser) { this.skip(); return; }
        await shoot('04-quote-code',
            '> 引用文です。\n> 複数行の引用。\n\n```js\nfunction hello() {\n  console.log("world");\n}\n```\n',
            'hello');
    });

    it('テーブル', async function () {
        if (!browser) { this.skip(); return; }
        await shoot('05-table',
            '| 名前 | 年齢 | 職業 |\n| --- | --- | --- |\n| 田中 | 30 | エンジニア |\n| 佐藤 | 25 | デザイナー |\n',
            'エンジニア');
    });

    it('複合ドキュメント', async function () {
        if (!browser) { this.skip(); return; }
        await shoot('06-mixed',
            '# プロジェクト計画\n\n## 概要\n\nこれは **重要な** プロジェクトです。\n\n## タスク\n\n- [x] 設計\n- [ ] 実装\n- [ ] テスト\n\n## コード例\n\n```python\ndef main():\n    pass\n```\n\n> 注意: 締め切りは厳守。\n\n| 項目 | 状態 |\n| --- | --- |\n| A | 完了 |\n',
            '締め切り');
    });
});
