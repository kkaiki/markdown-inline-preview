/**
 * Preview（Milkdown）内の画像を「実体データ」としてクリップボードにコピーするプラグイン。
 *
 * 動作フロー（vscode-webview-resource:// の場合）:
 *   1. ユーザーが画像ノードを選択して Cmd/Ctrl+C、または画像を右クリック→「Copy Image」
 *   2. WebView → Host: { type: 'copyImageRequest', src }
 *   3. Host がファイルを読んで base64 に変換
 *   4. Host → WebView: { type: 'imageCopied', dataUrl }
 *   5. WebView が navigator.clipboard.write() でクリップボードに書き込む
 *
 * data: URL（貼り付けで保存された埋め込み画像）の場合は Host へのラウンドトリップを
 * 行わず直接 Clipboard API に渡す（CSP の fetch ブロックを回避できる）。
 */

import { Plugin, PluginKey, NodeSelection } from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';
import { $prose } from '@milkdown/utils';
import { classifyMediaKind } from '../../shared/preview/mediaKind';

const imageCopyKey = new PluginKey<undefined>('imageCopy');

/**
 * 動画・音声として描画されているノード（`classifyMediaKind` 参照）はコピー対象外。
 * host 側（`handleCopyImageRequest`）は拡張子から画像 mime を推定するだけで動画/音声を
 * 扱えないため、そのまま通すと動画/音声の生バイトを画像として誤ラベルしたデータを
 * クリップボードへ書き込んでしまう。
 */
export function isCopyableImageSrc(src: string): boolean {
    return classifyMediaKind(src) === 'image';
}

export interface ImageCopyPluginOptions {
    /** Host にメッセージを送る関数（vscodeApi.postMessage）。 */
    postMessage: (msg: { type: 'copyImageRequest'; src: string }) => void;
}

// ── data: URL ユーティリティ ─────────────────────────────────────────────────

export function dataUrlToBlob(dataUrl: string): Blob {
    const [header, b64] = dataUrl.split(',');
    const mimeMatch = header.match(/:(.*?);/);
    const mimeRaw = mimeMatch?.[1] ?? '';
    const mime = mimeRaw !== '' ? mimeRaw : 'image/png';
    const bytes = atob(b64);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    return new Blob([arr], { type: mime });
}

// ── クリップボード書き込み ───────────────────────────────────────────────────

/**
 * data: URL をクリップボードに書き込む。
 * data: URL（Host から受け取った imageCopied.dataUrl）を blob に変換して
 * navigator.clipboard.write() に渡す。ClipboardItem は PNG / JPEG / GIF / WEBP を受け付ける。
 *
 * 画像 blob に加えて `text/html`（`<img src="data:...">`）も書き込む。これにより
 * Notion・Google Docs 等の HTML を受け取るエディタに貼り付けたとき、パス文字列ではなく
 * 画像そのものとして取り込まれる（画像 blob だけだとアプリによっては無視されるため）。
 */
export async function writeDataUrlToClipboard(dataUrl: string): Promise<boolean> {
    try {
        const blob = dataUrlToBlob(dataUrl);
        const type = blob.type.startsWith('image/') ? blob.type : 'image/png';
        const html = `<img src="${dataUrl}">`;
        const htmlBlob = new Blob([html], { type: 'text/html' });
        try {
            await navigator.clipboard.write([
                new ClipboardItem({ [type]: blob, 'text/html': htmlBlob })
            ]);
        } catch {
            // 一部環境は 1 ClipboardItem に複数 type を許さない。画像のみで再試行。
            await navigator.clipboard.write([new ClipboardItem({ [type]: blob })]);
        }
        return true;
    } catch {
        return false;
    }
}

// ── 右クリックコンテキストメニュー ──────────────────────────────────────────

function dismissContextMenu(): void {
    document.querySelectorAll('.ipreview-ctx-menu').forEach((el) => el.remove());
}

function showImageContextMenu(
    img: HTMLImageElement,
    clientX: number,
    clientY: number,
    onCopy: () => void
): void {
    dismissContextMenu();

    const menu = document.createElement('ul');
    menu.className = 'ipreview-ctx-menu';
    menu.setAttribute('role', 'menu');
    menu.style.left = `${clientX}px`;
    menu.style.top = `${clientY}px`;

    const li = document.createElement('li');
    li.setAttribute('role', 'none');

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('role', 'menuitem');
    btn.textContent = 'Copy Image';
    btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        dismissContextMenu();
        onCopy();
    });

    li.appendChild(btn);
    menu.appendChild(li);
    document.body.appendChild(menu);

    // 画面端クランプ
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
        menu.style.left = `${Math.max(0, window.innerWidth - rect.width - 4)}px`;
    }
    if (rect.bottom > window.innerHeight) {
        menu.style.top = `${Math.max(0, clientY - rect.height)}px`;
    }

    // メニュー外クリックで閉じる
    const dismiss = (e: Event) => {
        if (!menu.contains(e.target as Node)) {
            dismissContextMenu();
            document.removeEventListener('pointerdown', dismiss, true);
        }
    };
    requestAnimationFrame(() => {
        document.addEventListener('pointerdown', dismiss, true);
    });
}

// ── プラグイン本体 ───────────────────────────────────────────────────────────

/**
 * 選択された画像ノードに対して
 * - Cmd/Ctrl+C → copyImageRequest を Host へ送信
 * - 右クリック → "Copy Image" コンテキストメニュー表示
 *
 * data: URL の場合は Host を経由せず直接 Clipboard API に書き込む。
 */
export function createImageCopyPlugin(options: ImageCopyPluginOptions) {
    function requestCopy(view: EditorView, src: string): void {
        if (!src) return;

        if (src.startsWith('data:')) {
            // 埋め込み画像はラウンドトリップ不要
            void writeDataUrlToClipboard(src);
            return;
        }
        options.postMessage({ type: 'copyImageRequest', src });
    }

    return $prose(() => new Plugin({
        key: imageCopyKey,
        props: {
            handleDOMEvents: {
                copy: (view, event) => {
                    const { selection } = view.state;
                    if (!(selection instanceof NodeSelection)) return false;
                    if (selection.node.type.name !== 'image') return false;

                    const src = selection.node.attrs.src as string | undefined;
                    if (!src || !isCopyableImageSrc(src)) return false;

                    event.preventDefault();
                    requestCopy(view, src);
                    return true;
                },

                contextmenu: (view, event) => {
                    const target = event.target as HTMLElement;
                    const closest = target.closest('img');
                    const img = target instanceof HTMLImageElement ? target
                        : closest instanceof HTMLImageElement ? closest : null;
                    if (!img) return false;

                    event.preventDefault();
                    const src = img.src;
                    showImageContextMenu(img, event.clientX, event.clientY, () => {
                        requestCopy(view, src);
                    });
                    return true;
                }
            }
        }
    }));
}
