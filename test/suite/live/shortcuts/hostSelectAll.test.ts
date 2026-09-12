/**
 * host（VS Code / Cursor 本体）から飛んでくる「すべて選択」の扱い。
 *
 * 実機で計測した事実（2026-08-09、実 VS Code の webview に CDP で接続。手順と生ログは
 * docs/testing/vscode-webview-cdp-debug.md）:
 *   477ms  CM の段階的な ⌘A が中身を選ぶ（sel=245,454）／ defaultPrevented=true
 *   486ms  本体が document.execCommand('selectAll') を送る → sel=0,563（文書全体）へ上書き
 *
 * つまり webview 側で preventDefault しても本体の「すべて選択」は止まらない。
 *
 * 判定を**時間**でやると、本体の上書きが遅れて届いたときに素通りして段階が勝手に1つ進む
 * （行を選んだつもりが表全体になり「行がコピーできない」に見える）。そのため
 * **「最後に自分が設定した選択のままか」という状態**で判定する。
 */
import * as assert from 'assert';
import { shouldIgnoreHostSelectAll } from '../../../../src/live/shared/hostSelectAll';

describe('Live モード: host からの「すべて選択」', () => {
    it('自分が設定した選択のままなら、本体の上書きなので無視する', () => {
        assert.strictEqual(shouldIgnoreHostSelectAll({ from: 245, to: 454 }, { from: 245, to: 454 }), true);
    });

    it('上書きが遅れて届いても（時間に関係なく）無視する', () => {
        // 時間で判定していたときの退行防止: 何秒経っていようが選択が同じなら本体の上書き
        assert.strictEqual(shouldIgnoreHostSelectAll({ from: 0, to: 10 }, { from: 0, to: 10 }), true);
    });

    it('選択が変わっていれば段階選択として扱う', () => {
        assert.strictEqual(shouldIgnoreHostSelectAll({ from: 245, to: 454 }, { from: 300, to: 300 }), false);
    });

    it('一度も ⌘A を押していなければ無視しない（メニューの「すべて選択」）', () => {
        assert.strictEqual(shouldIgnoreHostSelectAll(null, { from: 5, to: 5 }), false);
    });

    it('開始位置だけ一致していても無視しない', () => {
        assert.strictEqual(shouldIgnoreHostSelectAll({ from: 245, to: 454 }, { from: 245, to: 999 }), false);
    });
});
