/**
 * Live モードの画像の貼り付け（純関数）: 保存するファイル名の決め方と、画像として扱うかの判定。
 *
 * ユーザー要望（2026-10-09）:「画像をペーストで自動で入れるようにして」「保存先は md ファイルと同じディレクトリで」。
 * 保存先は md ファイルのディレクトリ。名前は VS Code 標準の貼り付けと同じく `image.png`、重複したら `image-1.png`。
 */
import * as assert from 'assert';
import { imageExtension, pickImageFileName, shouldPasteAsImage } from '../../../../src/live/shared/imagePaste';

describe('Live モード: 画像の貼り付け', () => {
    describe('拡張子', () => {
        it('よく使う画像の MIME から拡張子を決める（GIF を含む）', () => {
            assert.strictEqual(imageExtension('image/png'), 'png');
            assert.strictEqual(imageExtension('image/gif'), 'gif');
            assert.strictEqual(imageExtension('image/jpeg'), 'jpg');
            assert.strictEqual(imageExtension('image/webp'), 'webp');
            assert.strictEqual(imageExtension('image/svg+xml'), 'svg');
        });

        it('画像でない MIME は null', () => {
            assert.strictEqual(imageExtension('text/plain'), null);
            assert.strictEqual(imageExtension('application/pdf'), null);
        });
    });

    describe('ファイル名', () => {
        const none = (): boolean => false;

        it('スクリーンショットなど名前が無ければ image.<拡張子>', () => {
            assert.strictEqual(pickImageFileName(undefined, 'png', none), 'image.png');
            assert.strictEqual(pickImageFileName('', 'gif', none), 'image.gif');
        });

        it('同じ名前があれば image-1, image-2 と連番にする', () => {
            const taken = new Set(['image.png', 'image-1.png']);
            assert.strictEqual(pickImageFileName(undefined, 'png', (n) => taken.has(n)), 'image-2.png');
        });

        it('ファイルをコピーして貼ったときは元の名前を使い、拡張子は MIME に合わせる', () => {
            assert.strictEqual(pickImageFileName('猫の写真.gif', 'gif', none), '猫の写真.gif');
            assert.strictEqual(pickImageFileName('photo.jpeg', 'jpg', none), 'photo.jpg');
        });

        it('空白・括弧・パス区切りは - に置き換える（Markdown のリンクが壊れないように）', () => {
            assert.strictEqual(pickImageFileName('my shot (1).png', 'png', none), 'my-shot-1.png');
            assert.strictEqual(pickImageFileName('../evil/x.png', 'png', none), 'x.png');
        });
    });

    describe('画像として貼るか', () => {
        it('画像ファイルだけがあれば画像として貼る', () => {
            assert.strictEqual(shouldPasteAsImage({ text: '', imageTypes: ['image/png'] }), true);
        });

        it('文字も入っていれば文字として貼る（Excel の範囲は画像も一緒に入るため）', () => {
            assert.strictEqual(shouldPasteAsImage({ text: 'a\tb', imageTypes: ['image/png'] }), false);
        });

        it('画像が無ければ画像として貼らない', () => {
            assert.strictEqual(shouldPasteAsImage({ text: '', imageTypes: [] }), false);
        });
    });
});
