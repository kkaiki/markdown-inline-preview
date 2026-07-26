/**
 * ソース Markdown のトップレベルにある連続した空行を、隣接ブロック間に
 * 空の paragraph ノード（本数 = 空行数）として復元する remark プラグイン。
 *
 * ソースの空行と Preview 上の行は 1:1 に対応させる（blank-line-preservation.md §1・§10）。
 * Preview の段落は CSS で `margin: 0` なので、空行を空 paragraph として実体化しない限り
 * その行は画面のどこにも現れず、左ガターの行番号もその行を飛ばしてしまう。
 * 2026-07-26 に一度「空行1行は追加ノード無し（N-1 個）」へ変更したが、ソースの行が
 * 表示から消えるためユーザー指示で差し戻した。
 *
 * remark-parse は空行そのものをノード化しないため、blank-line-preservation.md の
 * 仕様（連続する空行の本数を実体のある空段落として往復させる）を満たすには、
 * remark-parse がデフォルトで付与する mdast の `position`（行番号）を使って
 * ここでノードを補う必要がある。milkdown 自身は position を消費しないため、
 * このプラグインの前後で誰かに壊される心配はない。
 *
 * スコープはトップレベル（root.children）のみ。リスト項目間・blockquote内・
 * テーブル内の空行は対象外（tightenListSpacing 等の既存仕様と衝突するため）。
 */
import { $remark } from '@milkdown/utils';
import type { Root, RootContent } from 'mdast';

function insertBlankLineParagraphs(tree: Root): void {
    const children = tree.children;
    const result: RootContent[] = [];

    for (let i = 0; i < children.length; i++) {
        const node = children[i];
        result.push(node);

        const next = children[i + 1];
        if (!next) continue;

        const endLine = node.position?.end.line;
        const startLine = next.position?.start.line;
        if (endLine === null || endLine === undefined || startLine === null || startLine === undefined) continue;

        // 空行1行目から順に、1行につき空 paragraph 1個を対応させる（省略しない）。
        const blankLines = startLine - endLine - 1;
        for (let k = 0; k < blankLines; k++) {
            result.push({ type: 'paragraph', children: [] });
        }
    }

    tree.children = result;
}

export const blankLineRemarkPlugin = $remark('blankLinePreserve', () => () => (tree: Root) => {
    insertBlankLineParagraphs(tree);
});
