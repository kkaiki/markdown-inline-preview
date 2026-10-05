/**
 * Live モードで、長い文書（表・Mermaid・色つきラベル・長い行）をスクロールしても、
 * 位置が不意に飛んだり戻ったりしないこと（実 Chromium + 実 CodeMirror）。
 *
 * ユーザー報告 2026-10-05:「スクロールをしていると、変なところに飛ばされたり戻ったり進んだりします」
 * （再現した文書: 表 8 つ・Mermaid 2 つ・長い行・`<span style>` のラベルを含む 200 行ほどのスプリント概要）。
 *
 * 画面の外の行は高さを「推定」して描くので、表・図などの高さが描画のあとで変わると、
 * スクロール位置がずれる。ホイールで少しずつ送り、毎回の移動量が送った量とずれていないかを見る。
 */
import * as assert from 'assert';
import * as fs from 'fs';
import type { Browser } from 'playwright';
import { launchBrowser, openLive, type LiveHandle } from '../../liveBrowserHarness';

const WHEEL = 100;
/** 見えている内容がこれ以上ずれたら「飛んだ」とみなす（px）。小さな揺れは、描き終わった表の幅の調整などで起きうる。 */
const JUMP_LIMIT = 150;
/** スクロールを通して、全体の高さの推定がこれ以上外れていたらいけない（割合）。 */
const HEIGHT_DRIFT_LIMIT = 0.2;

/** 実際の文書の特徴（表 8・Mermaid 2・長い行・色つきラベル）を再現した文書。 */
function buildDoc(): string {
    const label = (c: string, text: string) =>
        `<span style="background:${c};color:#333;padding:2px 8px;border-radius:10px;font-weight:bold;white-space:nowrap">${text}</span>`;
    const long = 'これは長い説明の文です。'.repeat(40);
    const parts: string[] = ['# スプリント概要', '', `状態: ${label('#d3f9d8', '着手可能')} ${label('#fff3bf', '一部待ち')}`, ''];
    for (let section = 1; section <= 8; section++) {
        parts.push(`## ${section}. セクション`, '', long, '');
        parts.push('| # | 状態 | チケット | 担当 | 対応方法 | 待つもの |', '|---|---|---|---|---|---|');
        for (let row = 1; row <= 7; row++) {
            parts.push(
                `| ${row} | ${label('#fff3bf', '一部待ち')} | V1-API-00${row} ファイル・学生更新の認可の見直し | 可野 | ${long.slice(0, 90)} | ${long.slice(0, 50)} |`
            );
        }
        parts.push('');
        if (section === 3 || section === 6) {
            parts.push('```mermaid', 'graph TD', '  A[開始] --> B{判断}', '  B -->|はい| C[続ける]', '  B -->|いいえ| D[止める]', '```', '');
        }
        parts.push('- 箇条書きの項目 A', '- 箇条書きの項目 B', '');
    }
    return parts.join('\n');
}

interface Sample {
    top: number;
    height: number;
    /** 追っている要素（行・表）の、スクロール領域の上端からの画面上の位置（px）。追えなければ null。 */
    screenY: number | null;
    /** 追う要素が前回から切り替わったか（画面の外へ出た・描き直された）。 */
    switched: boolean;
}

describe('Live モード: 長い文書のスクロールが安定している（実ブラウザ）', function () {
    this.timeout(180000);

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

    /**
     * 画面に実際にある要素（行・表・図）を 1 つ追い、その上端の位置を返す。
     * ユーザーが見ているのはこの動きなので、追った要素が送った量だけ動いたかで「飛んだ」かを判定する。
     */
    async function sample(page: LiveHandle['page']): Promise<Sample> {
        return page.evaluate(() => {
            const w = window as unknown as { __anchorEl?: Element | null; __liveView: { scrollDOM: HTMLElement } };
            const s = w.__liveView.scrollDOM;
            const box = s.getBoundingClientRect();
            const visible = (el: Element | null | undefined): el is Element => {
                if (!el || !el.isConnected) return false;
                const r = el.getBoundingClientRect();
                return r.bottom > box.top + 4 && r.top < box.bottom - 4;
            };
            let switched = false;
            if (!visible(w.__anchorEl)) {
                // 画面の上寄りにある、実際に描かれた要素を選ぶ（行か、表・図などのブロック）
                const candidates = Array.from(s.querySelectorAll('.cm-line, .cm-live-table-wrap, .cm-live-mermaid'));
                w.__anchorEl = candidates.find((el) => visible(el) && el.getBoundingClientRect().top >= box.top) ?? candidates.find(visible) ?? null;
                switched = true;
            }
            const el = w.__anchorEl;
            return {
                top: s.scrollTop,
                height: s.scrollHeight,
                screenY: el ? el.getBoundingClientRect().top - box.top : null,
                switched
            };
        });
    }

    /** ホイールで少しずつ送り、毎回「追っている要素が画面上で動いた量」を返す（追えない回は NaN）。 */
    async function scrollBy(page: LiveHandle['page'], dy: number, steps: number): Promise<{ deltas: number[]; samples: Sample[] }> {
        await page.mouse.move(450, 300);
        await page.evaluate(() => { (window as unknown as { __anchorEl?: Element | null }).__anchorEl = null; });
        const samples: Sample[] = [await sample(page)];
        const deltas: number[] = [];
        for (let i = 0; i < steps; i++) {
            const prev = samples[samples.length - 1];
            await page.mouse.wheel(0, dy);
            await page.waitForTimeout(60);
            const s = await sample(page);
            // 同じ要素を追えていれば、画面上の位置が送った量だけ動いたはず。ずれた分が「飛び」。
            // 要素が切り替わった回（画面の外へ出るほど動いた）は、scrollTop の動きで見る。
            // 全体の高さが変わると CodeMirror が見えている内容を保つために scrollTop を補正するので、
            // 高さの変化の分は「説明できるずれ」として引く（それを超えた分が、内容が飛んだ量）。
            let moved: number;
            if (!s.switched && prev.screenY !== null && s.screenY !== null) {
                moved = prev.screenY - s.screenY;
            } else {
                const scrolled = s.top - prev.top;
                const unexplained = Math.max(0, Math.abs(scrolled - dy) - Math.abs(s.height - prev.height));
                moved = dy + Math.sign(scrolled - dy || 1) * unexplained;
            }
            deltas.push(moved);
            samples.push(s);
        }
        return { deltas, samples };
    }

    function summarize(label: string, dy: number, deltas: number[], samples: Sample[]): string[] {
        const bad: string[] = [];
        deltas.forEach((d, i) => {
            if (Number.isNaN(d)) return;
            const atEnd = samples[i + 1].top + 600 >= samples[i + 1].height - 2; // 末尾まで来たら止まってよい
            if (!atEnd && Math.abs(d - dy) > JUMP_LIMIT) {
                bad.push(`${label} ${i + 1} 回目: 送った量 ${dy}px に対し、見えている内容は ${d}px 動いた（全体の高さ ${samples[i].height}→${samples[i + 1].height}px）`);
            }
        });
        return bad;
    }

    it('下へ送ったとき、毎回ほぼ送った量だけ動く（飛ばない・戻らない）', async function () {
        if (!browser) { this.skip(); return; }
        const real = process.env['REAL_DOC'];
        const doc = real ? fs.readFileSync(real, 'utf8') : buildDoc();
        h = await openLive(browser, doc);
        await h.page.waitForTimeout(800); // 図の描画を待つ
        const before = await sample(h.page);
        const { deltas, samples } = await scrollBy(h.page, WHEEL, 60);
        const bad = summarize('下', WHEEL, deltas, samples);
        const after = samples[samples.length - 1];
        console.log(`    [測定] 文書 ${doc.split('\n').length} 行 / 全体の高さ ${before.height}→${after.height}px / 飛んだ回数 ${bad.length}`);
        bad.slice(0, 8).forEach((b) => console.log('    ' + b));
        assert.deepStrictEqual(bad, []);
        // 描くたびに全体の高さが大きく変わるのは、ブロックの部品の高さの推定が外れているから（飛びの原因）
        const drift = Math.abs(after.height - before.height) / before.height;
        assert.ok(drift <= HEIGHT_DRIFT_LIMIT, `全体の高さが ${before.height}px → ${after.height}px（${Math.round(drift * 100)}% 変わった）`);
    });

    it('上へ戻したときも、毎回ほぼ送った量だけ動く', async function () {
        if (!browser) { this.skip(); return; }
        const real = process.env['REAL_DOC'];
        const doc = real ? fs.readFileSync(real, 'utf8') : buildDoc();
        h = await openLive(browser, doc);
        await h.page.waitForTimeout(800);
        await scrollBy(h.page, WHEEL, 60); // いったん下へ
        await h.page.waitForTimeout(300);
        const { deltas, samples } = await scrollBy(h.page, -WHEEL, 40);
        const bad = summarize('上', -WHEEL, deltas, samples);
        console.log(`    [測定] 上へ: 飛んだ回数 ${bad.length}`);
        bad.slice(0, 8).forEach((b) => console.log('    ' + b));
        assert.deepStrictEqual(bad, []);
    });
});
