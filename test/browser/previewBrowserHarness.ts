/**
 * 実ブラウザ（システム Chrome / Playwright）で **ビルド済みの Preview webview バンドル**を
 * 起動するための回帰テスト・ハーネス。
 *
 * なぜ必要か:
 *   Preview は Milkdown（ProseMirror + list-item-block Web Component）で描画される。
 *   キャレット位置や選択の挙動は **実レイアウト + 実コンポーネント**が無いと再現しない不具合が
 *   あり（例: チェックボックス行頭 Backspace でカーソルが上の行へ飛ぶ）、jsdom 系の
 *   webview テスト（test/webview）では原理的に検出できない。ここでは本物の Chrome に
 *   `media/milkdown.bundle.js` を読み込ませ、実キー操作と実キャレット座標で検証する。
 *
 * 前提:
 *   - `npm run build:webview` で media/milkdown.bundle.js を生成済みであること
 *     （test:browser スクリプトが自動で行う）。
 *   - ブラウザはシステムの Google Chrome（`channel: 'chrome'`）を優先し、無ければ
 *     Playwright 同梱 Chromium、どちらも無ければ `null`（テスト側で skip）。
 */
import { chromium, type Browser, type Page } from 'playwright';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { pathToFileURL } from 'url';

const ROOT = process.cwd();
const MEDIA = path.join(ROOT, 'media');
const BUNDLE = path.join(MEDIA, 'milkdown.bundle.js');
const CSS = path.join(MEDIA, 'milkdown-preview.css');

/** Host → webview の init メッセージで渡す PreviewSettings（全フィールド必須）。 */
export const DEFAULT_SETTINGS = {
    theme: 'dark',
    fontFamily: 'sans-serif',
    fontSize: 16,
    maxWidth: 800,
    editable: true,
    syncScroll: false,
    enableMath: false,
    enableMermaid: false,
    showFrontmatter: false,
    enableTransitions: false,
    showFocusSyntax: false,
    enableSlashMenu: true,
    showToolbar: false,
    toolbarShowShortcuts: false,
    showLineNumbers: false,
    language: 'en'
};

/**
 * ブラウザを起動する。利用可能なブラウザが無ければ `null`（CI でブラウザ未導入でも
 * ビルドを壊さないよう、テスト側で this.skip() する）。
 */
export async function launchBrowser(): Promise<Browser | null> {
    // HEADED=1（または PWHEADED=1）で実ブラウザ画面を表示し、slowMo で操作を目視できる。
    //   例: `HEADED=1 npm run test:browser`
    const headed = process.env.HEADED === '1' || process.env.PWHEADED === '1';
    const slowMo = process.env.SLOWMO ? Number(process.env.SLOWMO) : (headed ? 300 : 0);
    const base: Record<string, unknown> = { headless: !headed, slowMo };
    const attempts: Array<Record<string, unknown>> = [{ channel: 'chrome' }, {}];
    for (const opts of attempts) {
        try {
            return await chromium.launch({ ...base, ...opts });
        } catch {
            // 次の候補を試す
        }
    }
    return null;
}

/** スクリーンショットの保存先（リポジトリ直下 test-screenshots/、.gitignore 済み）。 */
export const SCREENSHOT_DIR = path.join(ROOT, 'test-screenshots');

let fixtureUrlCache: string | null = null;

/**
 * 実バンドルを読み込む固定 HTML（file://）を一時ディレクトリに用意して URL を返す。
 * `acquireVsCodeApi` をバンドル読込前にスタブし、postMessage を window.__sent に貯める。
 */
function fixtureUrl(): string {
    if (fixtureUrlCache) return fixtureUrlCache;
    if (!fs.existsSync(BUNDLE)) {
        throw new Error(`webview バンドルが見つかりません: ${BUNDLE}\n  先に \`npm run build:webview\` を実行してください。`);
    }
    const cssLink = fs.existsSync(CSS) ? `<link rel="stylesheet" href="${pathToFileURL(CSS).href}">` : '';
    const html = `<!doctype html><html lang="en"><head><meta charset="UTF-8">
${cssLink}
<style>:root{--vscode-editor-background:#1e1e1e;--vscode-editor-foreground:#ddd;--vscode-font-family:sans-serif}
body{background:#1e1e1e;color:#ddd}</style>
<script>
  (function () {
    const sent = [];
    window.__sent = sent;
    window.acquireVsCodeApi = function () {
      return { postMessage: function (m) { sent.push(m); }, getState: function () { return {}; }, setState: function () {} };
    };
    // テスト専用シーム（milkdownApp.ts が createEditor 後に呼ぶ）。EditorView を保持する。
    window.__IPREVIEW_TEST_HOOK__ = function (view) { window.__view = view; };
  })();
</script>
</head><body>
<div id="frontmatter-panel" class="frontmatter-panel" hidden></div>
<div id="slash-menu" class="slash-menu" hidden></div>
<div id="milkdown-root" role="document"></div>
<script src="${pathToFileURL(BUNDLE).href}"></script>
</body></html>`;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ipreview-browser-'));
    const file = path.join(dir, 'preview.html');
    fs.writeFileSync(file, html);
    fixtureUrlCache = pathToFileURL(file).href;
    return fixtureUrlCache;
}

/** ドキュメント構造・選択のスナップショット（テストのアサーション用）。 */
export interface ModelSnapshot {
    /** doc 直下のブロック種別名（例: ['heading', 'paragraph']）。 */
    topTypes: string[];
    /** doc 全体のテキスト。 */
    text: string;
    /**
     * ネスト構造を読みやすく文字列化したもの。
     * 例: `heading(1)["Title"] | paragraph["body"]`
     *     `bullet_list[list_item(checked=false)[paragraph["task"]]]`
     */
    outline: string;
    /** 現在のカーソル（$from）が属するテキストブロックの文字列。 */
    selParentText: string;
    /** 選択の from 位置。 */
    selFrom: number;
    /** 選択の to 位置。 */
    selTo: number;
    /** 選択がcollapseしているか。 */
    selEmpty: boolean;
    /** 選択先頭が属する親ノードの型。 */
    selParentType: string;
    /** 選択先頭の親ノード内オフセット。 */
    selParentOffset: number;
}

export interface PreviewHandle {
    page: Page;
    /** ページ内で発生した未捕捉エラー（空であることをアサートする）。 */
    readonly errors: string[];
    /** ページが `console.error` に出した内容（空であることをアサートできる）。 */
    readonly consoleErrors: string[];
    /** 指定テキストを含む行をクリックし、Home で行頭へカーソルを移動。 */
    placeCursorAtLineStart(lineText: string): Promise<void>;
    /** 指定テキストを含む行をクリックし、End で行末へカーソルを移動。 */
    placeCursorAtLineEnd(lineText: string): Promise<void>;
    /** 実キーを押す（例: 'Backspace', 'Home', 'Meta+b', 'Control+Enter'）。 */
    press(key: string): Promise<void>;
    /** 文字列をタイプする（input rule を発火させる）。 */
    type(text: string): Promise<void>;
    /** 現在のキャレットの画面 top 座標（px）。取得不能なら null。 */
    caretTop(): Promise<number | null>;
    /** ドキュメント構造・選択のスナップショットを返す。 */
    model(): Promise<ModelSnapshot>;
    /**
     * 現在のカーソルが属するテキストブロック内で、カーソルのある「行」（`\n` 区切り）の
     * テキストだけを返す。`model().selParentText` はブロック全体（複数行にまたがる
     * code_block 等では全行分）を返すため、特定の行にいるかどうかの判定には使えない。
     */
    currentLineText(): Promise<string>;
    /**
     * doc 全体のプレーンテキストをブロック区切り `\n` で返す（`model().text` は
     * ProseMirror の `textContent` をそのまま使うためブロック間の区切りが無く、
     * 複数ブロックにまたがる文字忠実性の厳密比較には不向き）。
     */
    docText(): Promise<string>;
    /** エディタへフォーカスする。 */
    focusEditor(): Promise<void>;
    /**
     * 指定テキスト（最初の出現）をモデル上で範囲選択する。クリック/Shift 操作より
     * 確実（DOM フォーカス/タイミングに依存しない）。見つからなければ例外。
     */
    selectText(text: string): Promise<void>;
    /**
     * 指定テキストの実際の画面上の位置へ、実マウスクリック（`page.mouse.click`）でカーソルを
     * 置く。`page.getByText(...).click()` は要素境界（hljs の `<span>` 分割等）に依存して
     * 意図しない位置をクリックすることがあるため、DOM の Range から実座標を計算して
     * `page.mouse` で直接クリックする（要素境界に依存しない、真にピクセル精度のクリック）。
     */
    clickTextAt(text: string): Promise<void>;
    /** `clickTextAt` と同じ座標計算で、実マウスのダブルクリック（`clickCount: 2`）を行う。 */
    doubleClickTextAt(text: string): Promise<void>;
    /** 指定テキスト（最初の出現）の直後にカーソルを置く（プログラム的・確実）。 */
    placeCursorAfterText(text: string): Promise<void>;
    /** 指定テキスト（最初の出現）の直前にカーソルを置く（プログラム的・確実）。 */
    placeCursorBeforeText(text: string): Promise<void>;
    /** doc 末尾に空段落を足してそこへカーソルを移し、確定（collapse）させる。 */
    moveToEnd(): Promise<void>;
    /** ホストへ送られた最新の change Markdown（無ければ null）。 */
    lastChangeMarkdown(): Promise<string | null>;
    /** ホストへ送られた全change Markdownを送信順で返す。 */
    changeMessages(): Promise<string[]>;
    /** 指定Markdownがchangeとして送られるまで条件待機する。 */
    waitForMarkdown(expected: string, timeoutMs?: number): Promise<void>;
    /**
     * 現在のカーソル位置へ、markdown テキストの `paste` イベントを合成して発火させる
     * （実クリップボード API は file:// では権限制約があるため使わず、
     * `DataTransfer` + `ClipboardEvent` を直接組み立てて `view.dom` にディスパッチする）。
     * `@milkdown/plugin-clipboard` の `handlePaste` は HTML が無ければ `text/plain` を
     * markdown としてパースするため、実際のコピー&ペーストと同じコードパスを通る。
     */
    pasteMarkdownText(text: string): Promise<void>;
    /** スクリーンショットを test-screenshots/<name>.png に保存し、パスを返す（目視確認用）。 */
    screenshot(name: string): Promise<string>;
    /** 後始末。 */
    close(): Promise<void>;
}

/**
 * `.milkdown` 配下のテキストノードを走査し、指定文字列（最初の出現）を含む Range の
 * 画面中央座標を返す。見つからなければ null。
 */
async function locateTextRect(page: Page, text: string): Promise<{ x: number; y: number } | null> {
    return page.evaluate((t) => {
        const root = document.querySelector('.milkdown') || document.body;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        let node: Node | null;
        while ((node = walker.nextNode())) {
            const content = node.textContent || '';
            const idx = content.indexOf(t);
            if (idx < 0) continue;
            const range = document.createRange();
            range.setStart(node, idx);
            range.setEnd(node, idx + t.length);
            const rects = range.getClientRects();
            const rect = rects.length ? rects[0] : range.getBoundingClientRect();
            return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        }
        return null;
    }, text);
}

/**
 * 実バンドルでエディタを開き、指定 Markdown を init で流し込む。
 * `expectText` が描画されるまで待つ。
 */
export async function openPreview(
    browser: Browser,
    markdown: string,
    expectText?: string,
    settingsOverride?: Partial<typeof DEFAULT_SETTINGS>,
    frontmatter: string | null = null
): Promise<PreviewHandle> {
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    const errors: string[] = [];
    const consoleErrors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));
    page.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(message.text());
    });

    await page.goto(fixtureUrl());
    await page.evaluate(
        ({ md, settings, fm }) => window.postMessage({ type: 'init', markdown: md, settings, frontmatter: fm }, '*'),
        { md: markdown, settings: { ...DEFAULT_SETTINGS, ...settingsOverride }, fm: frontmatter }
    );
    if (expectText) {
        await page.waitForFunction(
            (t) => {
                const root = document.getElementById('milkdown-root');
                return !!root && !!root.innerText && root.innerText.includes(t);
            },
            expectText,
            { timeout: 5000 }
        );
    }
    // EditorView がテストフックに渡るまで待つ。
    await page.waitForFunction(() => !!(window as unknown as { __view?: unknown }).__view, undefined, { timeout: 5000 });
    // 初期描画（list-item-block コンポーネントのマウント）が落ち着くまで少し待つ。
    await page.waitForTimeout(250);

    return {
        page,
        errors,
        consoleErrors,
        async placeCursorAtLineStart(lineText: string) {
            await page.getByText(lineText, { exact: false }).first().click({ position: { x: 3, y: 6 } });
            await page.keyboard.press('Home');
            await page.waitForTimeout(120);
        },
        async placeCursorAtLineEnd(lineText: string) {
            await page.getByText(lineText, { exact: false }).first().click({ position: { x: 3, y: 6 } });
            await page.keyboard.press('End');
            await page.waitForTimeout(120);
        },
        async press(key: string) {
            await page.keyboard.press(key);
            await page.waitForTimeout(150);
        },
        async type(text: string) {
            // 人間らしい打鍵間隔。入力ルール → 非同期展開 → 再描画が 1 打鍵ごとに落ち着く
            // ようにし、現実のタイピングに近づける。
            await page.keyboard.type(text, { delay: 60 });
            await page.waitForTimeout(150);
        },
        async caretTop() {
            return page.evaluate(() => {
                const sel = window.getSelection();
                if (!sel || sel.rangeCount === 0) return null;
                const range = sel.getRangeAt(0);
                const rects = range.getClientRects();
                const rect = rects.length ? rects[0] : range.getBoundingClientRect();
                return Math.round(rect.top);
            });
        },
        async model(): Promise<ModelSnapshot> {
            return page.evaluate(() => {
                /* eslint-disable @typescript-eslint/no-explicit-any */
                const view = (window as any).__view;
                if (!view) throw new Error('__view 未設定（テストフックが呼ばれていない）');
                const state = view.state;
                const doc = state.doc;
                const outlineOf = (n: any): string => {
                    if (n.isText) {
                        const marks = (n.marks || []).map((mk: any) => mk.type.name);
                        return JSON.stringify(n.text) + (marks.length ? `{${marks.join(',')}}` : '');
                    }
                    let tag = n.type.name;
                    if (n.attrs && n.attrs.level) tag += `(${n.attrs.level})`;
                    else if (n.attrs && n.attrs.checked !== undefined) tag += `(checked=${n.attrs.checked})`;
                    const kids: string[] = [];
                    n.content.forEach((c: any) => kids.push(outlineOf(c)));
                    return kids.length ? `${tag}[${kids.join(', ')}]` : tag;
                };
                const topTypes: string[] = [];
                const tops: string[] = [];
                doc.forEach((n: any) => { topTypes.push(n.type.name); tops.push(outlineOf(n)); });
                return {
                    topTypes,
                    text: doc.textContent,
                    outline: tops.join(' | '),
                    selParentText: state.selection.$from.parent.textContent,
                    selFrom: state.selection.from,
                    selTo: state.selection.to,
                    selEmpty: state.selection.empty,
                    selParentType: state.selection.$from.parent.type.name,
                    selParentOffset: state.selection.$from.parentOffset
                };
                /* eslint-enable @typescript-eslint/no-explicit-any */
            });
        },
        async currentLineText() {
            return page.evaluate(() => {
                /* eslint-disable @typescript-eslint/no-explicit-any */
                const view = (window as any).__view;
                if (!view) throw new Error('__view 未設定（テストフックが呼ばれていない）');
                const $from = view.state.selection.$from;
                const parentText: string = $from.parent.textContent;
                const offset: number = $from.parentOffset;
                const lineStart = parentText.lastIndexOf('\n', offset - 1) + 1;
                const nextBreak = parentText.indexOf('\n', offset);
                const lineEnd = nextBreak < 0 ? parentText.length : nextBreak;
                return parentText.slice(lineStart, lineEnd);
                /* eslint-enable @typescript-eslint/no-explicit-any */
            });
        },
        async docText() {
            /* eslint-disable @typescript-eslint/no-explicit-any */
            return page.evaluate(() => {
                const view = (window as any).__view;
                if (!view) throw new Error('__view 未設定（テストフックが呼ばれていない）');
                const doc = view.state.doc;
                return doc.textBetween(0, doc.content.size, '\n', '\n');
            });
            /* eslint-enable @typescript-eslint/no-explicit-any */
        },
        async focusEditor() {
            /* eslint-disable @typescript-eslint/no-explicit-any */
            await page.evaluate(() => { (window as any).__view.focus(); });
            /* eslint-enable @typescript-eslint/no-explicit-any */
            await page.waitForTimeout(80);
        },
        async selectText(text: string) {
            /* eslint-disable @typescript-eslint/no-explicit-any */
            const ok = await page.evaluate((t) => {
                const view = (window as any).__view;
                let from = -1;
                view.state.doc.descendants((n: any, p: number) => {
                    if (from < 0 && n.isText && typeof n.text === 'string' && n.text.includes(t)) {
                        from = p + n.text.indexOf(t);
                        return false;
                    }
                    return true;
                });
                if (from < 0) return false;
                const TextSelection = view.state.selection.constructor;
                view.focus();
                view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, from + t.length)));
                return true;
            }, text);
            /* eslint-enable @typescript-eslint/no-explicit-any */
            if (!ok) throw new Error(`selectText: テキストが見つからない: ${text}`);
            await page.waitForTimeout(80);
        },
        async clickTextAt(text: string) {
            const rect = await locateTextRect(page, text);
            if (!rect) throw new Error(`clickTextAt: テキストが見つからない: ${text}`);
            await page.mouse.click(rect.x, rect.y);
            await page.waitForTimeout(120);
        },
        async doubleClickTextAt(text: string) {
            const rect = await locateTextRect(page, text);
            if (!rect) throw new Error(`doubleClickTextAt: テキストが見つからない: ${text}`);
            await page.mouse.click(rect.x, rect.y, { clickCount: 2 });
            await page.waitForTimeout(120);
        },
        async placeCursorAfterText(text: string) {
            /* eslint-disable @typescript-eslint/no-explicit-any */
            const ok = await page.evaluate((t) => {
                const view = (window as any).__view;
                let at = -1;
                view.state.doc.descendants((n: any, p: number) => {
                    if (at < 0 && n.isText && typeof n.text === 'string' && n.text.includes(t)) {
                        at = p + n.text.indexOf(t) + t.length;
                        return false;
                    }
                    return true;
                });
                if (at < 0) return false;
                // 現在の選択が NodeSelection（画像をクリックした後など）でも必ず
                // TextSelection を作れるよう、基底クラスの fromJSON 経由で生成する
                // （`selection.constructor` だと NodeSelection.create が呼ばれて落ちる）。
                const Selection = Object.getPrototypeOf(view.state.selection.constructor);
                view.focus();
                view.dispatch(view.state.tr.setSelection(
                    Selection.fromJSON(view.state.doc, { type: 'text', anchor: at, head: at })
                ));
                return true;
            }, text);
            /* eslint-enable @typescript-eslint/no-explicit-any */
            if (!ok) throw new Error(`placeCursorAfterText: 見つからない: ${text}`);
            await page.waitForTimeout(120);
        },
        async placeCursorBeforeText(text: string) {
            /* eslint-disable @typescript-eslint/no-explicit-any */
            const ok = await page.evaluate((t) => {
                const view = (window as any).__view;
                let at = -1;
                view.state.doc.descendants((n: any, p: number) => {
                    if (at < 0 && n.isText && typeof n.text === 'string' && n.text.includes(t)) {
                        at = p + n.text.indexOf(t);
                        return false;
                    }
                    return true;
                });
                if (at < 0) return false;
                // placeCursorAfterText と同じ理由で基底クラスの fromJSON 経由で作る。
                const Selection = Object.getPrototypeOf(view.state.selection.constructor);
                view.focus();
                view.dispatch(view.state.tr.setSelection(
                    Selection.fromJSON(view.state.doc, { type: 'text', anchor: at, head: at })
                ));
                return true;
            }, text);
            /* eslint-enable @typescript-eslint/no-explicit-any */
            if (!ok) throw new Error(`placeCursorBeforeText: 見つからない: ${text}`);
            await page.waitForTimeout(120);
        },
        async moveToEnd() {
            /* eslint-disable @typescript-eslint/no-explicit-any */
            await page.evaluate(() => {
                const view = (window as any).__view;
                const para = view.state.schema.nodes.paragraph.create();
                let tr = view.state.tr.insert(view.state.doc.content.size, para);
                const TextSelection = view.state.selection.constructor;
                tr = tr.setSelection(TextSelection.create(tr.doc, tr.doc.content.size - 1));
                view.focus();
                view.dispatch(tr);
            });
            /* eslint-enable @typescript-eslint/no-explicit-any */
            await page.waitForTimeout(250);
        },
        async pasteMarkdownText(text: string) {
            /* eslint-disable @typescript-eslint/no-explicit-any */
            await page.evaluate((t) => {
                const view = (window as any).__view;
                view.focus();
                const dt = new DataTransfer();
                dt.setData('text/plain', t);
                const evt = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
                view.dom.dispatchEvent(evt);
            }, text);
            /* eslint-enable @typescript-eslint/no-explicit-any */
            await page.waitForTimeout(150);
        },
        async lastChangeMarkdown() {
            /* eslint-disable @typescript-eslint/no-explicit-any */
            return page.evaluate(() => {
                const sent = (window as any).__sent || [];
                for (let i = sent.length - 1; i >= 0; i--) if (sent[i] && sent[i].type === 'change') return sent[i].markdown;
                return null;
            });
            /* eslint-enable @typescript-eslint/no-explicit-any */
        },
        async changeMessages() {
            /* eslint-disable @typescript-eslint/no-explicit-any */
            return page.evaluate(() => {
                const sent = (window as any).__sent || [];
                return sent
                    .filter((message: any) => message && message.type === 'change')
                    .map((message: any) => String(message.markdown));
            });
            /* eslint-enable @typescript-eslint/no-explicit-any */
        },
        async waitForMarkdown(expected: string, timeoutMs = 3000) {
            await page.waitForFunction(
                (expectedMarkdown) => {
                    /* eslint-disable @typescript-eslint/no-explicit-any */
                    const sent = (window as any).__sent || [];
                    return sent.some((message: any) => message?.type === 'change' && message.markdown === expectedMarkdown);
                    /* eslint-enable @typescript-eslint/no-explicit-any */
                },
                expected,
                { timeout: timeoutMs }
            );
        },
        async screenshot(name: string) {
            fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
            const file = path.join(SCREENSHOT_DIR, `${name}.png`);
            await page.screenshot({ path: file, fullPage: true });
            return file;
        },
        async close() {
            await page.close();
        }
    };
}
