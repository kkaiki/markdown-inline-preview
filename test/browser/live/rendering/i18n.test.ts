/**
 * UI 文字列がエディタのロケールに従うこと（実ブラウザ）。
 *
 * ユーザー指示（2026-09-12）:「エディタの設定に従い、基本的には英語にしつつ、
 * 日本語の時は日本語に対応するようにしてほしい」。
 * host は `vscode.env.language` を `init` の settings で渡す。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openLive, type LiveHandle } from '../../liveBrowserHarness';

const DOC = ['本文', '', '| 列A | 列B |', '| --- | --- |', '| a1 | b1 |', ''].join('\n');

describe('Live モード: UI の言語（実ブラウザ）', function () {
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

    /** ツールバーの「太字」ボタンに付く操作名。 */
    async function boldLabel(handle: LiveHandle): Promise<string | null> {
        return handle.page.evaluate(
            `document.querySelector('.cm-live-toolbar-button[data-format="bold"]').getAttribute('aria-label')`
        );
    }

    /** 表を右クリックして出るメニューの項目名。 */
    async function menuLabels(handle: LiveHandle): Promise<string[]> {
        const cell = handle.page.locator('.cm-live-table td').first();
        await cell.click({ button: 'right' });
        await handle.page.waitForTimeout(200);
        return handle.page.evaluate(
            `Array.from(document.querySelectorAll('.cm-live-table-menu-item')).map((b) => b.textContent.trim())`
        );
    }

    it('ロケール未指定なら英語で出る', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, DOC);
        assert.strictEqual(await boldLabel(h), 'Bold');
        assert.ok((await menuLabels(h)).includes('Select row'), '表メニューが英語になっていない');
    });

    it('英語ロケールでも英語のまま', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, DOC, { showLineNumbers: false, locale: 'en-US' });
        assert.strictEqual(await boldLabel(h), 'Bold');
    });

    it('日本語のエディタなら日本語で出る', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, DOC, { showLineNumbers: false, locale: 'ja' });
        assert.strictEqual(await boldLabel(h), '太字');
        assert.ok((await menuLabels(h)).includes('行を選択'), '表メニューが日本語になっていない');
    });
});
