/**
 * Markdown 画像記法 `![alt](src)` の参照先を、拡張子から
 * 「画像 / 動画 / 音声」のどれとして描画すべきか判定する。
 * `image` はスキーマ・保存形式の名称としては全種別共通（`imageMediaView.ts` 参照）。
 */
export type MediaKind = 'image' | 'video' | 'audio';

const VIDEO_EXTENSIONS = new Set(['mp4', 'webm']);
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'ogg', 'm4a']);

export function classifyMediaKind(src: string): MediaKind {
    const withoutQueryOrFragment = src.split(/[?#]/, 1)[0];
    const match = /\.([a-z0-9]+)$/i.exec(withoutQueryOrFragment);
    const ext = match?.[1]?.toLowerCase();
    if (ext && VIDEO_EXTENSIONS.has(ext)) return 'video';
    if (ext && AUDIO_EXTENSIONS.has(ext)) return 'audio';
    return 'image';
}
