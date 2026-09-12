/**
 * mermaid のプレビューが**実際に図として描かれる**ことを実 Chromium で固定する。
 *
 * ユーザー指示（2026-08-05）:「mermaid だけはその下に preview で見やすくなるように」
 * ユーザー確認（2026-08-09）:「mermaid もしっかり preview が見れるようになっていますか？」
 *
 * 既存の `test/browser/live/shortcuts/selectAllSteps.test.ts` は `graph TD` 1種類だけを
 * 見ていた。ここでは**図の種類・編集への追従・複数図・エラー表示**まで広げて、
 * 「開いた直後に1個描ければ良い」で終わらせない。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openLive, type LiveHandle } from '../../liveBrowserHarness';

describe('Live モード: mermaid プレビュー（実ブラウザ）', function () {
    this.timeout(120000);

    let browser: Browser | null = null;
    let h: LiveHandle | undefined;

    before(async () => {
        browser = await launchBrowser();
    });
    after(async function () {
        // 全スイート連続実行では後始末（browser.close）が 20 秒に収まらず
        // "after all" hook がタイムアウトすることがある（2026-09-12）。
        this.timeout(60000);
        await browser?.close();
    });
    afterEach(async () => {
        if (h) {
            await h.close();
            h = undefined;
        }
    });

    /** 描画済みの図の数。 */
    async function svgCount(handle: LiveHandle): Promise<number> {
        return handle.page.evaluate<number>(`document.querySelectorAll('.cm-live-mermaid svg').length`);
    }

    /** 図の中に出ている文字（ノードのラベル等）。 */
    async function svgText(handle: LiveHandle): Promise<string> {
        return handle.page.evaluate<string>(
            `[...document.querySelectorAll('.cm-live-mermaid svg text, .cm-live-mermaid svg .nodeLabel')].map(e => e.textContent).join('|')`
        );
    }

    const KINDS: [string, string, string][] = [
        ['フローチャート', '```mermaid\nflowchart LR\n  受付 --> 審査\n  審査 --> 完了\n```\n', '審査'],
        [
            'シーケンス図',
            '```mermaid\nsequenceDiagram\n  太郎->>花子: おはよう\n  花子-->>太郎: やあ\n```\n',
            'おはよう'
        ],
        ['円グラフ', '```mermaid\npie title 内訳\n  "犬" : 60\n  "猫" : 40\n```\n', '犬'],
        [
            'ガントチャート',
            '```mermaid\ngantt\n  title 予定\n  section 開発\n  設計 :a1, 2026-08-01, 3d\n```\n',
            '設計'
        ]
    ];

    for (const [name, doc, label] of KINDS) {
        it(`${name}が図として描かれる`, async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, doc);
            await h.page.waitForFunction(
                `document.querySelectorAll('.cm-live-mermaid svg').length > 0`,
                undefined,
                { timeout: 15000 }
            );
            assert.strictEqual(await svgCount(h), 1);
            const text = await svgText(h);
            assert.ok(text.includes(label), `図に "${label}" が出ていない: ${text}`);
            assert.deepStrictEqual(h.errors, []);
        });
    }

    it('図が複数あってもすべて描かれる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(
            browser,
            '# 図1\n\n```mermaid\ngraph TD;\n  A-->B;\n```\n\n# 図2\n\n```mermaid\ngraph LR;\n  C-->D;\n```\n'
        );
        await h.page.waitForFunction(
            `document.querySelectorAll('.cm-live-mermaid svg').length >= 2`,
            undefined,
            { timeout: 15000 }
        );
        assert.strictEqual(await svgCount(h), 2);
    });

    it('ソースを編集すると図も描き直される', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '```mermaid\ngraph TD;\n  あ-->い;\n```\n');
        await h.page.waitForFunction(
            `document.querySelectorAll('.cm-live-mermaid svg').length > 0`,
            undefined,
            { timeout: 15000 }
        );
        assert.ok((await svgText(h)).includes('あ'));
        // "い" を "う" に打ち替える
        const at = h ? '```mermaid\ngraph TD;\n  あ-->い;\n```\n'.indexOf('い') : 0;
        await h.select(at, at + 1);
        await h.type('う');
        await h.page.waitForFunction(
            `[...document.querySelectorAll('.cm-live-mermaid svg text, .cm-live-mermaid svg .nodeLabel')].some(e => e.textContent.includes('う'))`,
            undefined,
            { timeout: 15000 }
        );
        assert.ok((await svgText(h)).includes('う'), '編集後の図に反映されていない');
    });

    it('図のソース（```mermaid …）は畳まれず、そのまま編集できる', async function () {
        if (!browser) { this.skip(); return; }
        const doc = '```mermaid\ngraph TD;\n  A-->B;\n```\n';
        h = await openLive(browser, doc);
        await h.page.waitForTimeout(1200);
        const lines = await h.renderedLines();
        assert.ok(lines.some((l) => l.includes('graph TD;')), `ソースが見えていない: ${JSON.stringify(lines)}`);
        await h.setCursor(doc.indexOf('A-->B'));
        await h.type('X');
        assert.ok((await h.doc()).includes('XA-->B'));
    });

    it('構文が壊れていてもエディタは編集できるまま', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '```mermaid\ngraph TD;\n  A--\n```\n\n本文\n');
        await h.page.waitForTimeout(1500);
        await h.setCursor((await h.doc()).indexOf('本文'));
        await h.type('あ');
        assert.ok((await h.doc()).includes('あ本文'));
    });

    it('図はソースの下に置かれる（ソースの前に割り込まない）', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '```mermaid\ngraph TD;\n  A-->B;\n```\n');
        await h.page.waitForFunction(
            `document.querySelectorAll('.cm-live-mermaid svg').length > 0`,
            undefined,
            { timeout: 15000 }
        );
        const ok = await h.page.evaluate<boolean>(
            `(() => {
                const box = document.querySelector('.cm-live-mermaid');
                const lines = [...document.querySelectorAll('.cm-content .cm-line')];
                const src = lines.find(l => l.textContent.includes('graph TD;'));
                if (!box || !src) return false;
                return box.getBoundingClientRect().top >= src.getBoundingClientRect().bottom - 1;
            })()`
        );
        assert.strictEqual(ok, true, '図がソースより上に描かれている');
    });
});
