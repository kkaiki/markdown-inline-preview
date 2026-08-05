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
 *
 * 右クリックメニューはコピーだけでなく削除（`Delete Image`）も持つ。削除の実処理は
 * `imageDeletePlugin.ts`（選択中の画像に × ボタンを重ねる方のプラグイン）と共有する。
 */

import { Plugin, PluginKey, NodeSelection } from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';
import { $prose } from '@milkdown/utils';
import { classifyMediaKind } from '../../shared/preview/mediaKind';
import { deleteImageAtDom } from './imageDeletePlugin';
import { t } from './i18n';

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

/** 画像コピー機能が Host へ送るメッセージ。 */
export type ImageCopyHostMessage =
    | { type: 'copyImageRequest'; src: string }
    | { type: 'copyImageFailed'; reason: string };

export interface ImageCopyPluginOptions {
    /** Host にメッセージを送る関数（vscodeApi.postMessage）。 */
    postMessage: (msg: ImageCopyHostMessage) => void;
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
 * クリップボードへ書き込める唯一の画像タイプ。
 *
 * Chromium の Clipboard API は **image/png しか受け付けない**（実 Chromium で確認:
 * `image/jpeg` を渡すと `NotAllowedError: Type image/jpeg not supported on write.`）。
 * JPEG/GIF/WEBP の画像で「Copy Image しても何も貼り付かない」というユーザー報告
 * （2026-07-27）の直接原因がこれ。書き込み前に必ず PNG へ変換する。
 */
const CLIPBOARD_IMAGE_TYPE = 'image/png';

export interface ClipboardWriteOptions {
    /**
     * data: URL → PNG Blob 変換。既定は canvas 経由（`defaultConvertToPng`）。
     * jsdom には canvas が無いためテストから差し替えられるようにしている。
     */
    convertToPng?: (dataUrl: string) => Promise<Blob>;
    /** 書き込み失敗の通知。無言で失敗させないための経路（既定は何もしない）。 */
    onFailure?: (reason: string) => void;
}

function describeError(error: unknown): string {
    if (error instanceof DOMException) return `${error.name}: ${error.message}`;
    if (error instanceof Error) return error.message;
    return String(error);
}

/** data: URL を `<img>` → canvas 経由で PNG の Blob に焼き直す。 */
async function defaultConvertToPng(dataUrl: string): Promise<Blob> {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('image decode failed'));
        img.src = dataUrl;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d context unavailable');
    ctx.drawImage(img, 0, 0);
    return await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
            (blob) => (blob ? resolve(blob) : reject(new Error('canvas toBlob returned null'))),
            CLIPBOARD_IMAGE_TYPE
        );
    });
}

/**
 * data: URL をクリップボードに書き込む。
 * data: URL（Host から受け取った imageCopied.dataUrl）を blob に変換して
 * navigator.clipboard.write() に渡す。PNG 以外は Chromium が拒否するため PNG へ変換する
 * （`CLIPBOARD_IMAGE_TYPE` のコメント参照）。
 *
 * 画像 blob に加えて `text/html`（`<img src="data:...">`）も書き込む。これにより
 * Notion・Google Docs 等の HTML を受け取るエディタに貼り付けたとき、パス文字列ではなく
 * 画像そのものとして取り込まれる（画像 blob だけだとアプリによっては無視されるため）。
 */
export async function writeDataUrlToClipboard(
    dataUrl: string,
    options: ClipboardWriteOptions = {}
): Promise<boolean> {
    const fail = (reason: string): false => {
        options.onFailure?.(reason);
        return false;
    };

    let blob: Blob;
    try {
        const raw = dataUrlToBlob(dataUrl);
        blob = raw.type === CLIPBOARD_IMAGE_TYPE
            ? raw
            : await (options.convertToPng ?? defaultConvertToPng)(dataUrl);
    } catch (error) {
        return fail(`image conversion failed: ${describeError(error)}`);
    }

    const htmlBlob = new Blob([`<img src="${dataUrl}">`], { type: 'text/html' });
    try {
        await navigator.clipboard.write([
            new ClipboardItem({ [CLIPBOARD_IMAGE_TYPE]: blob, 'text/html': htmlBlob })
        ]);
        return true;
    } catch {
        // 一部環境は 1 ClipboardItem に複数 type を許さない。画像のみで再試行。
        try {
            await navigator.clipboard.write([new ClipboardItem({ [CLIPBOARD_IMAGE_TYPE]: blob })]);
            return true;
        } catch (error) {
            return fail(describeError(error));
        }
    }
}

// ── 右クリックコンテキストメニュー ──────────────────────────────────────────

function dismissContextMenu(): void {
    document.querySelectorAll('.ipreview-ctx-menu').forEach((el) => el.remove());
}

interface ContextMenuItem {
    label: string;
    onSelect: () => void;
}

function showImageContextMenu(
    clientX: number,
    clientY: number,
    items: ContextMenuItem[]
): void {
    dismissContextMenu();

    const menu = document.createElement('ul');
    menu.className = 'ipreview-ctx-menu';
    menu.setAttribute('role', 'menu');
    menu.style.left = `${clientX}px`;
    menu.style.top = `${clientY}px`;

    for (const item of items) {
        const li = document.createElement('li');
        li.setAttribute('role', 'none');

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.setAttribute('role', 'menuitem');
        btn.textContent = item.label;
        btn.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            dismissContextMenu();
            item.onSelect();
        });

        li.appendChild(btn);
        menu.appendChild(li);
    }
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
 * - 右クリック → "Copy Image" / "Delete Image" コンテキストメニュー表示
 *
 * data: URL の場合は Host を経由せず直接 Clipboard API に書き込む。
 */
export function createImageCopyPlugin(options: ImageCopyPluginOptions) {
    function requestCopy(view: EditorView, src: string): void {
        if (!src) return;

        if (src.startsWith('data:')) {
            // 埋め込み画像はラウンドトリップ不要
            void writeDataUrlToClipboard(src, {
                onFailure: (reason) => options.postMessage({ type: 'copyImageFailed', reason })
            });
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
                    showImageContextMenu(event.clientX, event.clientY, [
                        { label: t('Copy Image'), onSelect: () => requestCopy(view, src) },
                        { label: t('Delete Image'), onSelect: () => { deleteImageAtDom(view, img); } }
                    ]);
                    return true;
                }
            }
        }
    }));
}
