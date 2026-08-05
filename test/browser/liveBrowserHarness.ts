/**
 * 実ブラウザ（システム Chrome / Playwright）で **ビルド済みの Live モード webview バンドル**を
 * 起動するための統合テスト・ハーネス。
 *
 * なぜ必要か:
 *   Live モードの本質は「カーソル位置に応じて記法を出し入れする」ことであり、
 *   これは CodeMirror 6 の decoration（DOM から文字を消す replace）に依存する。
 *   実 DOM が無いと「本当に文字が消えているか」「カーソルが記法の上を1文字ずつ
 *   通過できるか」を検証できないため、jsdom では代替にならない。
 *
 * 前提:
 *   - `npm run build:livewebview` で media/live.bundle.js を生成済みであること
 *     （test:browser スクリプトが自動で行う）。
 *   - ブラウザが無い環境では `launchBrowser()` が null を返すのでテスト側で skip する。
 */
import { chromium, type Browser, type Page } from 'playwright';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { pathToFileURL } from 'url';

const ROOT = process.cwd();
const MEDIA = path.join(ROOT, 'media');
const BUNDLE = path.join(MEDIA, 'live.bundle.js');
const CSS = path.join(MEDIA, 'live-preview.css');
const KATEX_CSS = path.join(MEDIA, 'katex.min.css');

/** ブラウザを起動する。利用可能なブラウザが無ければ null。 */
export async function launchBrowser(): Promise<Browser | null> {
    const headed = process.env.HEADED === '1' || process.env.PWHEADED === '1';
    const slowMo = process.env.SLOWMO ? Number(process.env.SLOWMO) : headed ? 300 : 0;
    const base: Record<string, unknown> = { headless: !headed, slowMo };
    for (const opts of [{ channel: 'chrome' }, {}]) {
        try {
            return await chromium.launch({ ...base, ...opts });
        } catch {
            // 次の候補へ
        }
    }
    return null;
}

let fixtureUrlCache: string | null = null;

function fixtureUrl(): string {
    if (fixtureUrlCache) return fixtureUrlCache;
    if (!fs.existsSync(BUNDLE)) {
        throw new Error(
            `Live モードの webview バンドルが見つかりません: ${BUNDLE}\n` +
                '  先に `npm run build:livewebview` を実行してください。'
        );
    }
    const cssLink =
        (fs.existsSync(KATEX_CSS) ? `<link rel="stylesheet" href="${pathToFileURL(KATEX_CSS).href}">` : '') +
        (fs.existsSync(CSS) ? `<link rel="stylesheet" href="${pathToFileURL(CSS).href}">` : '');
    const html = `<!doctype html><html lang="ja"><head><meta charset="UTF-8">
${cssLink}
<style>
  :root{--vscode-editor-background:#1e1e1e;--vscode-editor-foreground:#ddd;
        --vscode-editor-font-family:monospace;--vscode-font-family:sans-serif}
  body{background:#1e1e1e;color:#ddd;margin:0}
</style>
<script>
  (function () {
    const sent = [];
    window.__sent = sent;
    window.acquireVsCodeApi = function () {
      return { postMessage: function (m) { sent.push(m); }, getState: function(){return {};}, setState: function(){} };
    };
  })();
</script>
</head><body>
<div id="live-root" role="document"></div>
<script src="${pathToFileURL(BUNDLE).href}"></script>
</body></html>`;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ipreview-live-'));
    const file = path.join(dir, 'live.html');
    fs.writeFileSync(file, html);
    fixtureUrlCache = pathToFileURL(file).href;
    return fixtureUrlCache;
}

export interface LiveHandle {
    page: Page;
    /** ページ内で発生した未捕捉エラー。空であることをアサートする。 */
    readonly errors: string[];
    /** エディタが保持している生 Markdown 全文。 */
    doc(): Promise<string>;
    /** カーソルを文字オフセットへ置く（フォーカスも当てる）。 */
    setCursor(offset: number): Promise<void>;
    /** 範囲選択する。 */
    select(from: number, to: number): Promise<void>;
    /** 現在のカーソル位置（head）。 */
    cursor(): Promise<number>;
    /** 実キーを押す。 */
    press(key: string): Promise<void>;
    /** 文字列をタイプする。 */
    type(text: string): Promise<void>;
    /** 画面に見えている行テキスト（`.cm-line` の textContent）の配列。 */
    renderedLines(): Promise<string[]>;
    /** 指定ソース行（1始まり）の画面表示テキスト。 */
    renderedLine(lineNumber: number): Promise<string>;
    /** エディタからフォーカスを外す。 */
    blur(): Promise<void>;
    /** エディタへフォーカスする。 */
    focus(): Promise<void>;
    /** host へ送られたメッセージ。 */
    sent(): Promise<Record<string, unknown>[]>;
    close(): Promise<void>;
}

/** host から webview へ渡す設定（`init` メッセージの settings）。 */
export interface LiveSettings {
    showLineNumbers?: boolean;
}

/**
 * Live モードの webview を開いて、`markdown` を初期文書としてロードする。
 */
export async function openLive(
    browser: Browser,
    markdown: string,
    settings: LiveSettings = { showLineNumbers: false }
): Promise<LiveHandle> {
    const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
    });

    await page.goto(fixtureUrl());
    await page.waitForFunction('typeof window.__liveReady !== "undefined"', undefined, { timeout: 15000 });
    await page.evaluate(
        (arg: { text: string; settings: LiveSettings }) => {
            window.postMessage({ type: 'init', text: arg.text, settings: arg.settings }, '*');
        },
        { text: markdown, settings }
    );
    await page.waitForFunction('!!window.__liveView', undefined, { timeout: 15000 });
    await page.waitForTimeout(120);

    const handle: LiveHandle = {
        page,
        errors,
        async doc() {
            return page.evaluate('window.__liveView.state.doc.toString()');
        },
        async setCursor(offset: number) {
            await page.evaluate((n: number) => {
                const v = window.__liveView;
                v.focus();
                v.dispatch({ selection: { anchor: n } });
            }, offset);
            await page.waitForTimeout(60);
        },
        async select(from: number, to: number) {
            await page.evaluate(
                (r: { a: number; h: number }) => {
                    const v = window.__liveView;
                    v.focus();
                    v.dispatch({ selection: { anchor: r.a, head: r.h } });
                },
                { a: from, h: to }
            );
            await page.waitForTimeout(60);
        },
        async cursor() {
            return page.evaluate<number>('window.__liveView.state.selection.main.head');
        },
        async press(key: string) {
            await page.keyboard.press(key);
            await page.waitForTimeout(80);
        },
        async type(text: string) {
            await page.keyboard.type(text, { delay: 20 });
            await page.waitForTimeout(80);
        },
        async renderedLines() {
            return page.evaluate<string[]>(
                `[...document.querySelectorAll('.cm-content > .cm-line')].map(e => e.textContent)`
            );
        },
        async renderedLine(lineNumber: number) {
            const lines = await handle.renderedLines();
            return lines[lineNumber - 1];
        },
        async blur() {
            await page.evaluate('window.__liveView.contentDOM.blur()');
            await page.waitForTimeout(80);
        },
        async focus() {
            await page.evaluate('window.__liveView.focus()');
            await page.waitForTimeout(80);
        },
        async sent() {
            return page.evaluate<Record<string, unknown>[]>('window.__sent');
        },
        async close() {
            await page.close();
        }
    };
    return handle;
}

declare global {
    interface Window {
        __liveView: {
            state: { doc: { toString(): string }; selection: { main: { head: number } } };
            dispatch(spec: unknown): void;
            focus(): void;
            contentDOM: HTMLElement;
            composing: boolean;
        };
        __liveReady: boolean;
        __sent: Record<string, unknown>[];
    }
}
