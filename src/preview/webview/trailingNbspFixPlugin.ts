/**
 * テキストブロック末尾に紛れ込んだ NBSP（U+00A0）を通常のスペースへ正規化するプラグイン。
 *
 * 背景: `white-space: normal` の HTML レンダリングルールでは行末（インラインコンテンツの
 * 末尾）に来た半角スペースは表示上「無いもの」として折りたたまれる。これを防ぐため、
 * ブラウザの contenteditable 実装は、スペースが現在のテキストノードの末尾に来ると
 * 自動的に通常スペースの代わりに NBSP を DOM へ挿入する（表示が消えないようにする
 * ブラウザ側の代替措置）。ProseMirror の DOMObserver はこれをそのまま doc モデルへ
 * 読み戻すため、NBSP が直列化 markdown にまで不可視文字として漏れてしまう
 * （詳細: docs/specifications/trailing-space-nbsp-corruption-fix.md）。
 *
 * この代替措置は「行末に一瞬でも来た」だけで発火し（例: 見出し変換の直後に
 * blockPrefixEditPlugin がプレフィックスを再挿入する瞬間など、ユーザーの直接タイプ
 * 以外の経路でも起こりうる）、後続の入力で自己修復することもあれば（`white-space:
 * normal` 環境）、autosave 相当の change 送信タイミングによっては修復前に保存されて
 * しまうこともある（一過性で再現条件が揃いにくい）。
 *
 * **範囲の絞り込み**: 当初は `newState.doc.descendants` で文書全体を毎トランザクション
 * 走査していたが、これは外部更新（`applyExternalContent` によるまるごと差し替え）や
 * IME 変換中の連続イベントなど、このプラグインが何もしないはずのトランザクションでも
 * 文書全体のトラバースという無視できないコストを常に払うことになり、既存の
 * `test/browser/ime/imeExternalUpdateRace.test.ts` のような**タイミングに敏感な
 * レースコンディションの回帰テスト**の実行タイミングを狂わせて壊す副作用があった
 * （このプラグイン自身は該当テストでは一度も発火しない＝ロジックは無関係なのに、
 * 走査コストの分だけ実行タイミングが変わり結果が変わってしまっていた）。
 * 今のトランザクションが実際に変更した範囲のテキストブロックだけを調べるように
 * 絞り込み、無関係なトランザクションでのコストをほぼゼロにした。
 *
 * テキストブロックの**末尾**（それより後に何も続かない位置）に限定するのは、
 * NBSP 本来の役割（隣接する2単語の間で行間の折り返しを防ぐ）はブロックの終端では
 * 意味を持たない（終端の後には同じ行に続くものが無い）ため、そこにある NBSP は
 * ほぼ確実にこのブラウザ挙動由来のアーティファクトであり、正規化しても実害が無い
 * （逆に文中の NBSP は意図的な使用の可能性があるため一切触らない）。
 */

import { Plugin, PluginKey, TextSelection } from '@milkdown/prose/state';
import { $prose } from '@milkdown/utils';

const NBSP = '\u00A0';
const trailingNbspFixKey = new PluginKey('trailingNbspFix');

export const trailingNbspFixPlugin = $prose(() => new Plugin({
    key: trailingNbspFixKey,
    appendTransaction(transactions, _oldState, newState) {
        const changedTrs = transactions.filter(tr => tr.docChanged);
        if (changedTrs.length === 0) return null;

        // 各トランザクションが実際に変更した範囲を、最終状態（newState）の座標系に
        // 変換して集める（prosemirror でよく使う「変更範囲を追跡する」定石）。
        const ranges: Array<{ from: number; to: number }> = [];
        for (const tr of changedTrs) {
            tr.mapping.maps.forEach((stepMap, i) => {
                stepMap.forEach((_fromA, _toA, fromB, toB) => {
                    const rest = tr.mapping.slice(i + 1);
                    ranges.push({ from: rest.map(fromB, -1), to: rest.map(toB, 1) });
                });
            });
        }
        if (ranges.length === 0) return null;

        const fixPositions = new Set<number>();
        for (const { from, to } of ranges) {
            const scanFrom = Math.max(0, from - 1);
            const scanTo = Math.min(newState.doc.content.size, to + 1);
            newState.doc.nodesBetween(scanFrom, scanTo, (node, pos) => {
                // code_block はソースの逐語的な内容なので触らない。
                if (node.type.name === 'code_block') return false;
                if (!node.isTextblock) return true;
                const last = node.lastChild;
                if (!last || !last.isText || !last.text || !last.text.endsWith(NBSP)) return true;
                // last は node の最後の子なので、node.nodeSize - 2 がその最終文字の開始位置。
                fixPositions.add(pos + node.nodeSize - 2);
                return true;
            });
        }
        if (fixPositions.size === 0) return null;

        // 1文字→1文字の置換（サイズ不変）なので、選択の絶対位置（数値）は
        // 置換対象の文字そのものを指していない限りズレない。ただし置換範囲の
        // 終端ちょうどに居るカーソル（＝末尾に打った直後の一般的なケース）は
        // ProseMirror の自動マッピングだと「置換範囲の中」に巻き込まれて解釈
        // されうる（次の入力で末尾の文字ごと上書きされてしまう）ため、
        // 元の選択位置を数値としてそのまま明示的に復元する。
        const { anchor, head } = newState.selection;
        const tr = newState.tr;
        for (const charPos of [...fixPositions].sort((a, b) => b - a)) {
            tr.replaceWith(charPos, charPos + 1, newState.schema.text(' '));
        }
        const docSize = tr.doc.content.size;
        const clamp = (p: number) => Math.max(0, Math.min(p, docSize));
        tr.setSelection(TextSelection.create(tr.doc, clamp(anchor), clamp(head)));
        tr.setMeta('addToHistory', false);
        return tr;
    }
}));
