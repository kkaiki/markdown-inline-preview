/**
 * 日本語 IME の変換確定 Enter が、そのまま改行 Enter としても処理されてしまう
 * レースを防ぐ。
 *
 * ProseMirror 自身にも同種の対策（`inOrNearComposition`、prosemirror-view）が
 * あるが、**Safari 限定**の分岐でしか働かない
 * （`if (safari && Date.now() - view.input.compositionEndedAt < 500) ...`）。
 * VS Code の Preview は Chromium/Electron の Webview なので、この対策の恩恵を
 * 受けられない。結果、IME でチェックボックス項目のテキストを確定した直後に
 * Enter を押すと、その Enter が「確定」だけでなく「改行（`splitListItem`）」
 * としても処理され、意図せず空の list_item が出来てしまう。ユーザーが続けて
 * もう一度 Enter を押すと、カーソルは空の list_item にいるため、ProseMirror
 * 標準の「空リスト項目で Enter → リストから離脱」動作が発動し、チェックボックス
 * ではないプレーン段落になってしまう（＝チェックボックスが次の行に反映されない）。
 *
 * **窓の測り方について**: 当初は `Date.now()`（JS コールバックが実際に実行された
 * 時刻）を基準に固定 500ms の窓を使っていたが、これは 2 つの問題があった。
 * 1. 500ms は広すぎる。`compositionend` はキー確定（Enter）だけでなく、
 *    スペース/クリック/自動確定でも発火する。「スペースで IME を確定し、
 *    その直後に本当に改行したくて Enter を押した」という正当な操作まで誤って
 *    無視してしまう回帰があった（`imeEnterRace.test.ts` の
 *    「composition confirmed WITHOUT Enter」で再現）。
 * 2. `requestAnimationFrame` で窓を区切る案も試したが、rAF は実際のペイントに
 *    紐づくため、バックグラウンドタブや CDP 経由のテスト（コマンドの往復に
 *    実時間がかかる）では簡単に数フレーム分ずれてしまい、本来捕まえたい
 *    「同じ物理的な Enter 押下が compositionend と keydown の 2 イベントに
 *    分かれて届く」ケースを取りこぼす（再現テストが再び失敗する）。
 *
 * そこで、JS コールバックの実行時刻ではなく、**ブラウザが記録したネイティブの
 * `event.timeStamp`**（実際にその入力が起きた瞬間の単調増加クロック値。JS 側の
 * 処理や CDP のラウンドトリップ遅延に影響されない）どうしの差を比較する。
 * 同一の物理キー押下が 2 イベントに分裂したケースは timeStamp がほぼ一致（数ms
 * 以内）するはずで、これは実際のユーザーが「今度こそ改行のため」に押し直す
 * 現実的な間隔よりずっと短い。
 */
import { Plugin, PluginKey } from '@milkdown/prose/state';
import { $prose } from '@milkdown/utils';

// 同一の物理 Enter 押下が compositionend と keydown に分裂して届く場合の
// 現実的な上限。人間が実際に「もう一度 Enter を押す」間隔よりは十分短い。
const DUPLICATE_ENTER_TIMESTAMP_GAP_MS = 50;

export function createImeEnterGuardPlugin() {
    return $prose(() => {
        let compositionEndedAtTimeStamp = -Infinity;

        return new Plugin({
            key: new PluginKey('imeEnterGuard'),
            props: {
                handleDOMEvents: {
                    compositionend: (_view, event) => {
                        compositionEndedAtTimeStamp = event.timeStamp;
                        return false;
                    }
                },
                handleKeyDown(_view, event) {
                    if (event.key !== 'Enter') return false;
                    if (event.timeStamp - compositionEndedAtTimeStamp >= DUPLICATE_ENTER_TIMESTAMP_GAP_MS) return false;
                    // 一度だけ無視する。次の Enter は通常どおり改行として処理する。
                    compositionEndedAtTimeStamp = -Infinity;
                    event.preventDefault();
                    return true;
                }
            }
        });
    });
}
