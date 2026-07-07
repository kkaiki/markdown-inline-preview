/**
 * resolveExternalPush（自分の書き込みのエコーを内容ベースで弾く）のユニットテスト。
 *
 * 回帰の主眼: `onExternalFileChange`（FileSystemWatcher 経由の外部変更検知）が
 * 同期フラグ（`applyingRemoteEdit`）だけに頼っていると、自分の保存の遅延エコーを
 * 取りこぼし、古い・短いディスク内容が Webview へ push されて、入力継続中のカーソルが
 * 文書末尾へ飛んでしまう（詳細: docs/specifications/stale-external-push-cursor-jump-fix.md）。
 * `resolveExternalPush` はこの判定を `changeSub` と `onExternalFileChange` の両方で
 * 共有し、内容が一致すれば push しない（null を返す）ことを保証する。
 */
import * as assert from 'assert';
import { resolveExternalPush, resolveWebviewSaveDecision } from '../../../../src/preview/host/externalEcho';

describe('resolveExternalPush', () => {
    it('直近に自分が書き込んだ内容と一致するなら push しない（null）', () => {
        assert.strictEqual(resolveExternalPush('same content\n', 'same content\n'), null);
    });

    it('自分が書き込んだ内容と異なれば、その内容をそのまま返す（push する）', () => {
        assert.strictEqual(resolveExternalPush('new content\n', 'old content\n'), 'new content\n');
    });

    it('lastAppliedFromWebview が null（まだ何も書いていない）なら常に push する', () => {
        assert.strictEqual(resolveExternalPush('content\n', null), 'content\n');
    });

    it('両方が空文字列でも一致すれば push しない', () => {
        assert.strictEqual(resolveExternalPush('', ''), null);
    });
});

describe('resolveWebviewSaveDecision', () => {
    it('ディスク内容が document モデルと一致するなら適用してよい（apply）', () => {
        assert.strictEqual(
            resolveWebviewSaveDecision('same\n', 'same\n', null),
            'apply'
        );
    });

    it('ディスク内容が自分の直近の書き込みと一致するなら適用してよい（apply）', () => {
        assert.strictEqual(
            resolveWebviewSaveDecision('my last save\n', 'stale model\n', 'my last save\n'),
            'apply'
        );
    });

    it('ディスクが document モデルとも自分の直近の書き込みとも食い違うなら見送る（defer） — 外部ツールが割り込んで書き換えた可能性', () => {
        assert.strictEqual(
            resolveWebviewSaveDecision('externally changed\n', 'stale model\n', 'my last save\n'),
            'defer'
        );
    });

    it('lastAppliedFromWebview が null（まだ何も保存していない）でも、document モデルと食い違えば defer', () => {
        assert.strictEqual(
            resolveWebviewSaveDecision('externally changed\n', 'original\n', null),
            'defer'
        );
    });
});
