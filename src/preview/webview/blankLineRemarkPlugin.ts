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

/** ソース文字列の行数。末尾の改行1個は「次の行」として数えない（`'A\n'` は1行）。 */
function countSourceLines(source: string): number {
    const lines = source.split('\n');
    if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
    return lines.length;
}

function blankParagraph(): RootContent {
    return { type: 'paragraph', children: [] };
}

function insertBlankLineParagraphs(tree: Root, source?: string): void {
    const children = tree.children;
    const result: RootContent[] = [];

    // 文書の先頭にある空行（blank-line-preservation.md §11）。frontmatter を持つファイルは
    // splitFrontmatter が本文を `\n# 見出し...` の形で渡すため、この経路を必ず通る。
    const firstStartLine = children[0]?.position?.start.line;
    if (typeof firstStartLine === 'number') {
        for (let k = 0; k < firstStartLine - 1; k++) result.push(blankParagraph());
    }

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
            result.push(blankParagraph());
        }
    }

    // 文書の末尾にある空行。最後のブロックの終了行より後ろにある行はすべて空行。
    const lastEndLine = children[children.length - 1]?.position?.end.line;
    if (typeof source === 'string' && typeof lastEndLine === 'number') {
        const trailingBlankLines = countSourceLines(source) - lastEndLine;
        for (let k = 0; k < trailingBlankLines; k++) {
            result.push(blankParagraph());
        }
    }

    tree.children = result;
}

export const blankLineRemarkPlugin = $remark('blankLinePreserve', () => () => (tree: Root, file) => {
    // 末尾の空行は mdast の position だけでは分からない（最後のノード以降の情報が無い）ため、
    // remark が保持しているソース文字列そのものを見る。
    const source = file?.value === undefined || file.value === null ? undefined : String(file.value);
    insertBlankLineParagraphs(tree, source);
});
