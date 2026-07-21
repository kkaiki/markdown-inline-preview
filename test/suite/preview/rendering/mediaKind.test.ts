import * as assert from 'assert';
import { classifyMediaKind } from '../../../../src/shared/preview/mediaKind';

/**
 * 画像リンク先の拡張子から「画像 / 動画 / 音声」を判定する純関数のテスト。
 * Preview の image ノード（`![alt](src)`）を `<img>`/`<video>`/`<audio>` の
 * どれで描画するかを決める判定ロジック（imageMediaView.ts が使う）。
 */
describe('classifyMediaKind（画像/動画/音声の拡張子判定）', () => {
    it('mp4・webm は video と判定する', () => {
        assert.strictEqual(classifyMediaKind('assets/clip.mp4'), 'video');
        assert.strictEqual(classifyMediaKind('assets/clip.webm'), 'video');
    });

    it('mp3・wav・ogg・m4a は audio と判定する', () => {
        assert.strictEqual(classifyMediaKind('assets/clip.mp3'), 'audio');
        assert.strictEqual(classifyMediaKind('assets/clip.wav'), 'audio');
        assert.strictEqual(classifyMediaKind('assets/clip.ogg'), 'audio');
        assert.strictEqual(classifyMediaKind('assets/clip.m4a'), 'audio');
    });

    it('png・jpg・gif・webp・svg は image と判定する（既存動作の回帰防止）', () => {
        assert.strictEqual(classifyMediaKind('assets/pic.png'), 'image');
        assert.strictEqual(classifyMediaKind('assets/pic.jpg'), 'image');
        assert.strictEqual(classifyMediaKind('assets/pic.jpeg'), 'image');
        assert.strictEqual(classifyMediaKind('assets/pic.gif'), 'image');
        assert.strictEqual(classifyMediaKind('assets/pic.webp'), 'image');
        assert.strictEqual(classifyMediaKind('assets/pic.svg'), 'image');
    });

    it('拡張子が無い・未知の場合は image にフォールバックする', () => {
        assert.strictEqual(classifyMediaKind('assets/no-extension'), 'image');
        assert.strictEqual(classifyMediaKind('assets/pic.bmp'), 'image');
        assert.strictEqual(classifyMediaKind('data:image/png;base64,AAAA'), 'image');
    });

    it('webview URI のクエリ文字列・フラグメントを無視して判定する', () => {
        assert.strictEqual(
            classifyMediaKind('https://file+.vscode-resource.vscode-cdn.net/assets/clip.mp4?id=abc-123'),
            'video'
        );
        assert.strictEqual(classifyMediaKind('assets/pic.webp#frag'), 'image');
        assert.strictEqual(classifyMediaKind('assets/clip.mp3?t=1&x=2'), 'audio');
    });

    it('拡張子の大文字小文字を区別しない', () => {
        assert.strictEqual(classifyMediaKind('assets/CLIP.MP4'), 'video');
        assert.strictEqual(classifyMediaKind('assets/CLIP.MP3'), 'audio');
    });
});
