/**
 * 実ブラウザ回帰テスト: Preview の画像をクリックで削除・右クリックでコピー/削除できること。
 *
 * 画像は ProseMirror の leaf ノードで、クリックすれば NodeSelection にはなるものの、
 * 「選択されたことが見た目で分からない」「削除する手段が Backspace しかない」状態だった
 * （ユーザー要望 2026-07-27「画像をクリックすることで削除できるようにしつつ、右クリックなどで
 * コピーもできるようにして欲しい」）。コピー（Cmd+C / 右クリック「Copy Image」）は
 * `imageCopyPlugin.ts` に実装済みだが、削除の導線が無かった。
 *
 * ここでは実バンドル・実 Chromium・実マウス操作で、
 * - 画像をクリックすると画像ノードが選択され、選択中は見た目で分かる
 * - 選択中の画像の右上に削除ボタン（×）が重なって表示される
 * - × をクリックすると画像だけが削除され、前後の段落は壊れない
 * - 選択解除（Escape / 他所クリック）で削除ボタンが消える
 * - 右クリックメニューに「Copy Image」と「Delete Image」が並び、Delete で削除できる
 * - 削除は Undo で元に戻せる
 * を検証する。
 *
 * 画像の src は実ファイルに依存しない data: URL（120×80 の SVG）を使う。相対パスだと
 * ブラウザが読み込めず矩形が潰れて実マウスで掴めないため。
 *
 * 実行: `npm run test:browser`。ブラウザが無い環境では skip。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openPreview, type PreviewHandle } from '../previewBrowserHarness';

/** 120×80 の青い矩形 SVG（data: URL。Markdown のリンク先として安全な base64）。 */
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80">'
    + '<rect width="120" height="80" fill="#4a90d9"/></svg>';
const IMAGE_SRC = `data:image/svg+xml;base64,${Buffer.from(SVG, 'utf8').toString('base64')}`;
const SRC = `above\n\n![pic](${IMAGE_SRC})\n\nbelow\n`;

/**
 * 文書中の実画像。`.milkdown img` だけだと ProseMirror が空段落に挿入する
 * 0×0 の `img.ProseMirror-separator` を先に掴んでしまうため必ず除外する。
 */
const IMG_SELECTOR = '.milkdown img:not(.ProseMirror-separator)';

/** 現在の選択が NodeSelection の場合、その選択ノードの型名を返す（そうでなければ null）。 */
async function selectedNodeType(h: PreviewHandle): Promise<string | null> {
    return h.page.evaluate(() => {
        /* eslint-disable @typescript-eslint/no-explicit-any */
        const node = (window as any).__view.state.selection.node;
        return node ? node.type.name : null;
        /* eslint-enable @typescript-eslint/no-explicit-any */
    });
}

/** 画像の中央を実マウスでクリックする。 */
async function clickImage(h: PreviewHandle): Promise<void> {
    const box = await h.page.locator(IMG_SELECTOR).first().boundingBox();
    assert.ok(box, '.milkdown img が見つからない');
    await h.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await h.page.waitForTimeout(150);
}

/** 画像の中央を実マウスで右クリックする。 */
async function rightClickImage(h: PreviewHandle): Promise<void> {
    const box = await h.page.locator(IMG_SELECTOR).first().boundingBox();
    assert.ok(box, '.milkdown img が見つからない');
    await h.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
    await h.page.waitForTimeout(150);
}

/** 表示中のコンテキストメニュー項目のラベル一覧。 */
async function contextMenuLabels(h: PreviewHandle): Promise<string[]> {
    return h.page.$$eval('.ipreview-ctx-menu button', (els) =>
        els.map((el) => (el.textContent || '').trim())
    );
}

describe('実ブラウザ: Preview の画像をクリックで削除・右クリックでコピー/削除', function () {
    this.timeout(120000);

    let browser: Browser | null = null;
    let h: PreviewHandle | undefined;

    before(async () => { browser = await launchBrowser(); });
    after(async () => { await browser?.close(); });
    afterEach(async () => { if (h) { await h.close(); h = undefined; } });

    it('画像をクリックすると画像ノードが選択される', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, SRC, 'below');
        await clickImage(h);
        assert.strictEqual(await selectedNodeType(h), 'image', 'クリックで画像が選択されていない');
        assert.deepStrictEqual(h.errors, []);
    });

    it('画像を選択すると削除ボタン（×）が画像の上に表示される', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, SRC, 'below');
        assert.strictEqual(
            await h.page.locator('.ipreview-image-delete').count(), 0,
            '選択していないのに削除ボタンが出ている'
        );

        await clickImage(h);
        const btn = h.page.locator('.ipreview-image-delete');
        await assert.doesNotReject(
            btn.waitFor({ state: 'visible', timeout: 2000 }),
            '画像を選択しても削除ボタンが表示されない'
        );

        // 画像の矩形と重なっていること（＝画像の上に乗った × に見えること）。
        const imgBox = await h.page.locator(IMG_SELECTOR).first().boundingBox();
        const btnBox = await btn.boundingBox();
        assert.ok(imgBox && btnBox, '矩形が取得できない');
        const overlaps =
            btnBox.x + btnBox.width > imgBox.x && btnBox.x < imgBox.x + imgBox.width &&
            btnBox.y + btnBox.height > imgBox.y && btnBox.y < imgBox.y + imgBox.height;
        assert.ok(overlaps, `削除ボタンが画像の上に無い: img=${JSON.stringify(imgBox)} btn=${JSON.stringify(btnBox)}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('削除ボタンをクリックすると画像だけが削除され前後の段落は残る', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, SRC, 'below');
        await clickImage(h);
        await h.page.locator('.ipreview-image-delete').click();
        await h.page.waitForTimeout(200);

        assert.strictEqual(await h.page.locator(IMG_SELECTOR).count(), 0, '画像が削除されていない');
        const m = await h.model();
        assert.ok(
            m.outline.includes('paragraph["above"]') && m.outline.includes('paragraph["below"]'),
            `前後の段落が壊れた: ${m.outline}`
        );
        const md = await h.lastChangeMarkdown();
        assert.ok(md !== null && !md.includes('!['), `Markdown から画像記法が消えていない: ${md}`);
        // 削除後は削除ボタン自体も消える。
        assert.strictEqual(
            await h.page.locator('.ipreview-image-delete').count(), 0,
            '画像を消したのに削除ボタンが残っている'
        );
        assert.deepStrictEqual(h.errors, []);
    });

    it('画像以外の場所をクリックして選択を解除すると削除ボタンは消える', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, SRC, 'below');
        await clickImage(h);
        await h.page.locator('.ipreview-image-delete').waitFor({ state: 'visible', timeout: 2000 });

        await h.clickTextAt('below');
        await h.page.waitForTimeout(200);
        assert.strictEqual(
            await h.page.locator('.ipreview-image-delete').count(), 0,
            '選択解除後も削除ボタンが残っている'
        );
        assert.deepStrictEqual(h.errors, []);
    });

    it('選択中の画像は非選択時と見た目が変わる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, SRC, 'below');
        const styleOf = () => h.page.evaluate((sel: string) => {
            const img = document.querySelector(sel);
            if (!img) return {};
            const s = getComputedStyle(img);
            return { outline: `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}`, boxShadow: s.boxShadow };
        }, IMG_SELECTOR);
        const before = await styleOf();
        await clickImage(h);
        assert.strictEqual(await selectedNodeType(h), 'image', '前提: クリックで画像が選択されていない');
        const after = await styleOf();
        assert.notDeepStrictEqual(after, before, `選択しても画像の見た目が変わらない: ${JSON.stringify(before)}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('画像を右クリックするとコピーと削除のメニューが出る', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, SRC, 'below');
        await rightClickImage(h);
        const labels = await contextMenuLabels(h);
        assert.ok(labels.includes('Copy Image'), `メニューに Copy Image が無い: ${JSON.stringify(labels)}`);
        assert.ok(labels.includes('Delete Image'), `メニューに Delete Image が無い: ${JSON.stringify(labels)}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('右クリックメニューの Delete Image で画像が削除される', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, SRC, 'below');
        await rightClickImage(h);
        await h.page.locator('.ipreview-ctx-menu button', { hasText: 'Delete Image' }).click();
        await h.page.waitForTimeout(200);

        assert.strictEqual(await h.page.locator(IMG_SELECTOR).count(), 0, '画像が削除されていない');
        assert.strictEqual(
            await h.page.locator('.ipreview-ctx-menu').count(), 0,
            '削除後もコンテキストメニューが開いたまま'
        );
        const m = await h.model();
        assert.ok(
            m.outline.includes('paragraph["above"]') && m.outline.includes('paragraph["below"]'),
            `前後の段落が壊れた: ${m.outline}`
        );
        assert.deepStrictEqual(h.errors, []);
    });

    it('削除ボタンで消した画像は Undo で元に戻る', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, SRC, 'below');
        await clickImage(h);
        await h.page.locator('.ipreview-image-delete').click();
        await h.page.waitForTimeout(200);
        assert.strictEqual(await h.page.locator(IMG_SELECTOR).count(), 0, '前提: 画像が削除されていない');

        await h.press('Meta+z');
        await h.page.waitForTimeout(200);
        assert.strictEqual(await h.page.locator(IMG_SELECTOR).count(), 1, 'Undo で画像が戻らない');
        assert.deepStrictEqual(h.errors, []);
    });

    it('動画には削除ボタンを出さない（ネイティブ controls の誤爆を避ける）', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, 'above\n\n![clip](assets/clip.mp4)\n\nbelow\n', 'below');
        // 動画ノードをプログラム的に NodeSelection にする（実クリックはネイティブ controls に
        // 奪われるため）。ページ内から NodeSelection クラスを import できないので、
        // Selection.fromJSON({type:'node'}) 経由で作る。
        await h.page.evaluate(() => {
            /* eslint-disable @typescript-eslint/no-explicit-any */
            const view = (window as any).__view;
            let pos = -1;
            view.state.doc.descendants((node: any, p: number) => {
                if (pos < 0 && node.type.name === 'image') pos = p;
            });
            if (pos < 0) throw new Error('動画ノードが見つからない');
            const Selection = Object.getPrototypeOf(view.state.selection.constructor);
            view.dispatch(view.state.tr.setSelection(
                Selection.fromJSON(view.state.doc, { type: 'node', anchor: pos })
            ));
            /* eslint-enable @typescript-eslint/no-explicit-any */
        });
        await h.page.waitForTimeout(150);
        assert.strictEqual(
            await h.page.locator('.ipreview-image-delete').count(), 0,
            '動画に削除ボタンが出ている'
        );
        assert.deepStrictEqual(h.errors, []);
    });
});
