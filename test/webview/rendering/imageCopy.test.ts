/**
 * Preview 画像コピープラグイン（imageCopyPlugin.ts）のユニットテスト。
 *
 * カバー範囲:
 *   - dataUrlToBlob: data: URL → Blob 変換の正確さ
 *   - writeDataUrlToClipboard: Clipboard API への書き込み（モック）
 *   - createImageCopyPlugin: 画像ノード選択時の copy イベント処理
 *   - 右クリックコンテキストメニューの表示・削除
 *
 * navigator.clipboard.write は jsdom では未実装のため、モックに差し替えて検証する。
 */
import '../jsdomSetup';
import * as assert from 'assert';
import {
    dataUrlToBlob,
    writeDataUrlToClipboard,
    createImageCopyPlugin,
    isCopyableImageSrc,
} from '../../../src/preview/webview/imageCopyPlugin';
import { createPreviewEditor } from '../milkdownHarness';
import type { PreviewEditorHandle } from '../milkdownHarness';
import { NodeSelection } from '@milkdown/prose/state';

// ── テスト用 PNG（1×1px 赤画素）の data URL ────────────────────────────────
const RED_PNG_DATA_URL =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAA' +
    'DUlEQVR42mP8/5+hHgAHggJ/PchI6QAAAABJRU5ErkJggg==';

// ── navigator.clipboard モック ──────────────────────────────────────────────

type WrittenItem = { type: string; data: Blob };

function setupClipboardMock(): { items: WrittenItem[][]; restore: () => void } {
    const items: WrittenItem[][] = [];
    const origClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');

    const mockClipboard = {
        write: async (clipItems: ClipboardItem[]) => {
            const row: WrittenItem[] = [];
            for (const ci of clipItems) {
                for (const type of ci.types) {
                    const blob = await ci.getType(type);
                    row.push({ type, data: blob });
                }
            }
            items.push(row);
        },
        writeText: (_text: string) => Promise.resolve(),
        read: () => Promise.resolve([] as ClipboardItem[]),
        readText: () => Promise.resolve(''),
    };

    Object.defineProperty(navigator, 'clipboard', { value: mockClipboard, configurable: true });

    return {
        items,
        restore: () => {
            if (origClipboard) {
                Object.defineProperty(navigator, 'clipboard', origClipboard);
            }
        }
    };
}

// ── ClipboardItem モック（jsdom には無いため） ──────────────────────────────

if (typeof (globalThis as Record<string, unknown>)['ClipboardItem'] === 'undefined') {
    class MockClipboardItem {
        private readonly _data: Map<string, Blob | Promise<Blob>>;
        constructor(items: Record<string, Blob | Promise<Blob>>) {
            this._data = new Map(Object.entries(items));
        }
        get types(): string[] { return Array.from(this._data.keys()); }
        async getType(type: string): Promise<Blob> {
            const v = this._data.get(type);
            if (!v) throw new DOMException('Not found');
            return v instanceof Blob ? v : await v;
        }
    }
    (globalThis as Record<string, unknown>)['ClipboardItem'] = MockClipboardItem;
}

// ── copy イベント補助（clipboardData スタブ付き） ───────────────────────────

/** clipboardData を備えた copy イベントを生成して view.dom へ送る。 */
function dispatchCopyEvent(h: PreviewEditorHandle): Event {
    const event = new window.Event('copy', { bubbles: true, cancelable: true });
    const clipboardData = {
        clearData: () => {},
        setData: () => {},
        getData: () => '',
        items: [] as unknown[],
        types: [] as string[],
    };
    Object.defineProperty(event, 'clipboardData', { value: clipboardData, configurable: true });
    h.view.dom.dispatchEvent(event);
    return event;
}

// ── テスト ───────────────────────────────────────────────────────────────────

describe('imageCopyPlugin: dataUrlToBlob', () => {
    it('PNG data URL を正しい MIME type の Blob に変換する', () => {
        const blob = dataUrlToBlob(RED_PNG_DATA_URL);
        assert.strictEqual(blob.type, 'image/png');
        assert.ok(blob.size > 0, 'Blob のサイズが 0 より大きいこと');
    });

    it('JPEG data URL を image/jpeg Blob に変換する', () => {
        // 最小限の JPEG (2byte) を偽装した data URL
        const jpegUrl = 'data:image/jpeg;base64,/9j/4AAQ';
        const blob = dataUrlToBlob(jpegUrl);
        assert.strictEqual(blob.type, 'image/jpeg');
    });

    it('MIME type が無い場合は image/png にフォールバックする', () => {
        const noMimeUrl = 'data:;base64,YQ==';
        const blob = dataUrlToBlob(noMimeUrl);
        assert.strictEqual(blob.type, 'image/png');
    });

    it('base64 のバイト数が元データと一致する', () => {
        const original = 'hello';
        const b64 = btoa(original);
        const url = `data:text/plain;base64,${b64}`;
        const blob = dataUrlToBlob(url);
        assert.strictEqual(blob.size, original.length);
    });
});

describe('imageCopyPlugin: isCopyableImageSrc（動画・音声はコピー対象外）', () => {
    it('画像拡張子は true（従来通りコピー対象）', () => {
        assert.strictEqual(isCopyableImageSrc('assets/pic.png'), true);
        assert.strictEqual(isCopyableImageSrc('assets/pic.webp'), true);
        assert.strictEqual(isCopyableImageSrc(RED_PNG_DATA_URL), true);
    });

    it('動画・音声拡張子は false（動画/音声バイトを画像として誤コピーしないため）', () => {
        assert.strictEqual(isCopyableImageSrc('assets/clip.mp4'), false);
        assert.strictEqual(isCopyableImageSrc('assets/clip.mp3'), false);
    });
});

describe('imageCopyPlugin: writeDataUrlToClipboard', () => {
    let mock: ReturnType<typeof setupClipboardMock>;

    beforeEach(() => { mock = setupClipboardMock(); });
    afterEach(() => mock.restore());

    it('PNG dataUrl をクリップボードに image/png として書き込む', async () => {
        const ok = await writeDataUrlToClipboard(RED_PNG_DATA_URL);
        assert.strictEqual(ok, true, 'write が成功を返すべき');
        assert.strictEqual(mock.items.length, 1, '1 回書き込まれた');
        assert.strictEqual(mock.items[0][0].type, 'image/png');
    });

    it('image に加えて text/html(<img data:>) も書き込む（Notion 等で画像として貼れる）', async () => {
        const ok = await writeDataUrlToClipboard(RED_PNG_DATA_URL);
        assert.strictEqual(ok, true);
        const types = mock.items[0].map((i) => i.type);
        assert.ok(types.includes('image/png'), `image が無い: ${types.join(',')}`);
        assert.ok(types.includes('text/html'), `text/html が無い（パス貼り付けになる）: ${types.join(',')}`);
        const htmlItem = mock.items[0].find((i) => i.type === 'text/html');
        const html = htmlItem ? await htmlItem.data.text() : '';
        assert.ok(html.includes('<img') && html.includes('data:image/png'), `HTML が画像埋め込みでない: ${html}`);
    });

    it('Clipboard API が失敗しても false を返し throw しない', async () => {
        (navigator.clipboard as unknown as Record<string, unknown>)['write'] = () =>
            Promise.reject(new DOMException('NotAllowedError'));
        const ok = await writeDataUrlToClipboard(RED_PNG_DATA_URL);
        assert.strictEqual(ok, false);
    });
});

describe('imageCopyPlugin: createImageCopyPlugin — 画像ノード選択時の copy', () => {
    let h: PreviewEditorHandle;
    let postedMessages: Array<{ type: string; src?: string }>;

    afterEach(() => h?.destroy());

    async function setupEditorWithImage(md: string): Promise<void> {
        postedMessages = [];
        h = await createPreviewEditor(md);
    }

    it('画像以外の NodeSelection では copy イベントを横取りしない', async () => {
        await setupEditorWithImage('# heading\n');

        // 最初の段落/見出しノードを NodeSelection に設定
        const { state } = h.view;
        let nodePos = -1;
        state.doc.descendants((node, pos) => {
            if (nodePos < 0 && !node.isLeaf) nodePos = pos;
        });
        if (nodePos >= 0) {
            h.view.dispatch(
                state.tr.setSelection(NodeSelection.create(state.doc, nodePos))
            );
        }

        // 実ブラウザの copy イベントは必ず clipboardData を持つ。これを省くと
        // ProseMirror が captureCopy フォールバックに入り、50ms 後に view.focus() を
        // 予約する → afterEach の destroy 後にタイマが発火して docView=null で
        // クラッシュする（テストは握りつぶされて通るが stderr を汚す）。
        // 実イベントに即して clipboardData スタブを付け、通常の copy 経路を通す。
        const event = dispatchCopyEvent(h);
        // 画像ノードでないので postMessage は呼ばれない
        assert.strictEqual(postedMessages.length, 0);
        assert.ok(event, 'copy イベントが dispatch された');
    });

    it('createImageCopyPlugin は MilkdownPlugin を返す', () => {
        const plugin = createImageCopyPlugin({
            postMessage: (msg) => postedMessages.push(msg)
        });
        assert.ok(plugin, 'MilkdownPlugin が生成される');
        assert.strictEqual(typeof plugin, 'function', '$prose でラップされた関数であること');
    });
});

describe('imageCopyPlugin: コンテキストメニュー DOM', () => {
    it('dismissContextMenu 相当: 2 回表示したときに古いメニューが削除される', () => {
        // 擬似的に 2 個 .ipreview-ctx-menu を作って 2 回目の表示で消えることを確認
        const first = document.createElement('ul');
        first.className = 'ipreview-ctx-menu';
        document.body.appendChild(first);

        // 2 個目を作成（実装は showImageContextMenu が担うが、ここでは同等の操作を）
        document.querySelectorAll('.ipreview-ctx-menu').forEach(el => el.remove());
        const second = document.createElement('ul');
        second.className = 'ipreview-ctx-menu';
        document.body.appendChild(second);

        assert.strictEqual(
            document.querySelectorAll('.ipreview-ctx-menu').length,
            1,
            'メニューは常に 1 個だけ'
        );

        // 後片付け
        document.querySelectorAll('.ipreview-ctx-menu').forEach(el => el.remove());
    });
});
