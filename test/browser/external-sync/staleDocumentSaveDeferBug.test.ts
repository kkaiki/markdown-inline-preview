/**
 * 実バグ回帰テスト: 外部（AI等）書き換え直後に Preview で入力を続けると、host 側の
 * 「document モデルの陳腐化」誤検知により、その入力が保存されずに消える不具合。
 *
 * ## 背景
 *
 * Preview だけを開いている（Raw のテキストエディタが無い）状態で外部ツールが .md を
 * 直接書き換えると、`FileSystemWatcher` が検知してディスクの最新内容を webview へ push する
 * （`readDocumentFromDisk()` 経由。`stale-external-push-cursor-jump-fix.md`）。この push は
 * ディスクを直接読むため正しく機能する。
 *
 * 問題は **push した後、webview から戻ってくる次の `change`（ユーザーが続けて入力した内容）を
 * host が保存してよいかどうかの判定**（`resolveWebviewSaveDecision`,
 * `src/preview/host/externalEcho.ts`）にある。この判定は `document.getText()`
 * （VS Code の TextDocument モデル）が最新かどうかに依存しているが、
 * その TextDocument モデル自体は外部ディスク書き込みを自動リロードしないことがある
 * （`test/extension/raw/external-sync.test.ts` 11.1/11.1c で確認済みの既知の制約）。
 *
 * 修正前は、host が「直近に webview へ push した内容」を追跡しておらず、
 * `document.getText()` の陳腐化を「新たな外部割り込みが発生した」と誤認して defer し続け、
 * ユーザーが外部編集の直後に Preview で入力した内容が **保存されず、host が古いディスク
 * 内容を再 push することで画面上からも消えてしまう**（実バグ）。
 *
 * 実行: `npm run test:browser`。ブラウザが無い環境では skip。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openPreview, type PreviewHandle } from '../previewBrowserHarness';
import { resolveWebviewSaveDecision } from '../../../src/preview/host/externalEcho';

describe('実バグ回帰: 外部書き換え直後の入力が document モデル陳腐化で消える', function () {
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

    async function postUpdate(handle: PreviewHandle, markdown: string): Promise<void> {
        await handle.page.evaluate(
            (md) => window.postMessage({ type: 'update', markdown: md, frontmatter: null }, '*'),
            markdown
        );
    }

    it('外部 push 直後にユーザーが入力を続けても、host（修正後）は document モデルの陳腐化で保存を defer しない', async function () {
        if (!browser) { this.skip(); return; }

        const original = '# タイトル\n\n本文\n\nTAIL\n';
        h = await openPreview(browser, original, 'TAIL');

        // 外部ツール（AI 等）がディスクを書き換えた、という想定で host が push する 'update'。
        // 実際の host はここで readDocumentFromDisk() の結果をそのまま push し、
        // 「直近に webview へ push した内容」として憶えておく（修正後の lastPushedToWebview）。
        const external = '# タイトル\n\n外部ツールが書き換えた本文\n\nTAIL\n';
        await postUpdate(h, external);
        await h.page.waitForTimeout(200);

        // ユーザーがそのまま Preview で入力を続ける。
        await h.placeCursorAfterText('TAIL');
        await h.type('!');

        const candidate = await h.lastChangeMarkdown();
        assert.ok(candidate?.includes('!'), '前提: 入力した文字が change として host へ送られているはず');
        assert.ok(candidate?.includes('外部ツールが書き換えた本文'),
            '前提: 外部編集の内容を基準にした change のはず');

        // host 側の実際の判定ロジックを、修正後の想定どおりに呼び出す:
        // ディスクは外部編集後の内容、document モデルは（auto-reload されておらず）まだ古い、
        // webview へは直近に外部内容を push 済み（lastPushedToWebview）。
        const decision = resolveWebviewSaveDecision(
            external,       // ディスクの実内容（外部書き込み後、まだ何も保存していない）
            original,       // document モデル（stale。auto-reload されていない）
            null,           // webview 由来ではまだ何も保存していない
            external        // 直近に host が webview へ push した内容
        );
        assert.strictEqual(decision, 'apply',
            'document モデルが外部書き込みに追従していないだけで、正当なユーザー入力の保存が defer されてしまう（実バグ）。'
            + 'defer だった場合、host は古いディスク内容を再 push し、ユーザーが今打った "!" が画面上から消えてしまう。');

        // apply と判定される（＝host が古い内容を再 push しない）ので、webview 上の
        // 入力内容はそのまま保たれているはず。
        const model = await h.model();
        assert.ok(model.text.includes('!'),
            `ユーザーの入力 "!" が webview 上から消えている: ${JSON.stringify(model.text)}`);
        assert.deepStrictEqual(h.errors, []);
    });
});
