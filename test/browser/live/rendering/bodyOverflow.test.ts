/**
 * 幅の広いブロック（表など）があっても、本文が画面幅からはみ出さないことを固定する。
 *
 * ユーザー報告（2026-09-12）:「どうしてこれは画面の幅に収まっていないの？本文のところです。
 * テーブルなどはみ出る時があればそれは幅に収めるか、横のスクロールにできるようにするべきでは？」
 *
 * 原因は CodeMirror の `.cm-content` が flex アイテムで `min-width: auto`（= 中身の
 * min-content）のため、セル内で折り返せない表があると本文まで表の幅で折り返していたこと。
 * 表は自分の中（`.cm-live-table-wrap`）で横スクロールさせ、本文はペース幅で折り返す。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openLive, type LiveHandle } from '../../liveBrowserHarness';

/** セルが長くて折り返しにくい表 + 本文。 */
const DOC = [
    '# 見出し',
    '',
    'これは本文の段落です。ペインの幅で折り返してほしい。',
    '',
    '| 論点 | 事実 |',
    '|---|---|',
    '| WIF スコープ | `principalSet://iam.googleapis.com/projects/1234567890/locations/global/workloadIdentityPools/github/attribute.repository/Org/repo` でリポジトリ全体になっている |',
    '| ruleset | `protect-main-develop`: required checks は `Lint` と `Test / Test` のみ。`required_approving_review_count: 0` |',
    '',
    'このあとの段落も同じ幅で折り返す。',
    ''
].join('\n');

describe('Live モード: 幅の広いブロックがある文書（実ブラウザ）', function () {
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

    interface Metrics {
        scrollerW: number;
        scrollerScrollW: number;
        contentW: number;
        tableW: number;
        tableScrollW: number;
    }

    async function metrics(handle: LiveHandle): Promise<Metrics> {
        return handle.page.evaluate(`(() => {
            const scroller = document.querySelector('.cm-scroller');
            const content = document.querySelector('.cm-content');
            const wrap = document.querySelector('.cm-live-table-wrap');
            return {
                scrollerW: scroller.clientWidth,
                scrollerScrollW: scroller.scrollWidth,
                contentW: Math.round(content.getBoundingClientRect().width),
                tableW: wrap ? Math.round(wrap.getBoundingClientRect().width) : 0,
                tableScrollW: wrap ? wrap.scrollWidth : 0
            };
        })()`);
    }

    it('セルの長い表があっても、本文はペインの幅に収まる（横に広がらない）', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, DOC);
        await h.page.setViewportSize({ width: 520, height: 700 });
        await h.page.waitForTimeout(400);

        const m = await metrics(h);
        assert.ok(
            m.contentW <= m.scrollerW + 1,
            `本文がペインより広い: content=${m.contentW}px pane=${m.scrollerW}px`
        );
        assert.ok(
            m.scrollerScrollW <= m.scrollerW + 1,
            `編集領域が横スクロールしている: scrollWidth=${m.scrollerScrollW}px pane=${m.scrollerW}px`
        );
    });

    it('収まらない表は表自身が横スクロールする（中身は削らない）', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, DOC);
        await h.page.setViewportSize({ width: 520, height: 700 });
        await h.page.waitForTimeout(400);

        const m = await metrics(h);
        assert.ok(m.tableW > 0, '表のラッパーが無い');
        assert.ok(
            m.tableScrollW > m.tableW,
            `表が横スクロールできない: width=${m.tableW}px scrollWidth=${m.tableScrollW}px`
        );

        const moved = await h.page.evaluate(`(() => {
            const wrap = document.querySelector('.cm-live-table-wrap');
            wrap.scrollLeft = wrap.scrollWidth;
            return wrap.scrollLeft;
        })()`);
        assert.ok(Number(moved) > 0, '表を横スクロールできない');
    });
});
