/**
 * Notion 風のブロック変換（⌥⌘0〜9）。
 *
 * Live モードはドキュメントが生 Markdown なので、変換は「行頭のプレフィックスを
 * 差し替えるだけ」で済む。対応表（どの数字がどのブロックか）は Raw / Preview と
 * 共通の `NOTION_BLOCK_KEYMAP` を使う。
 */
import type { NotionBlockAction } from '../../shared/notionBlockKeymap';

export interface BlockActionResult {
    /** 置き換え後の行テキスト。 */
    text: string;
    /** 本文が始まる桁（カーソルの置き先）。 */
    contentStart: number;
}

/** 行頭のインデントと、既存のブロックプレフィックスを取り除いた本文を返す。 */
function stripPrefix(line: string): { indent: string; body: string } {
    const m = /^([ \t]*)(.*)$/.exec(line);
    const indent = m ? m[1] : '';
    let body = m ? m[2] : line;
    body = body
        .replace(/^#{1,6} /, '')
        .replace(/^[-*+] \[[ xX]\] /, '')
        .replace(/^[-*+] /, '')
        .replace(/^\d+[.)] /, '')
        .replace(/^> ?/, '');
    return { indent, body };
}

/** 種別ごとの行頭プレフィックス。codeBlock / toggleList は行の置換では表せないので持たない。 */
const PREFIX: Partial<Record<NotionBlockAction, string>> = {
    paragraph: '',
    heading1: '# ',
    heading2: '## ',
    heading3: '### ',
    todo: '- [ ] ',
    bulletList: '- ',
    orderedList: '1. ',
    blockquote: '> '
};

/**
 * 1行にブロック変換を当てる。`null` を返したら行の置換では表せない
 * （codeBlock / toggleList。呼び出し側が `wrapBlockAction` で包む）。
 */
export function applyBlockAction(line: string, action: NotionBlockAction): BlockActionResult | null {
    const prefix = PREFIX[action];
    if (prefix === undefined) return null;
    const { indent, body } = stripPrefix(line);
    return { text: `${indent}${prefix}${body}`, contentStart: indent.length + prefix.length };
}

/** 複数行をまとめて包む変換（`applyBlockAction` が null を返す種別）。 */
export type WrappingBlockAction = 'codeBlock' | 'toggleList';

/**
 * 選択範囲（複数行可）をブロックで包む。
 *
 * - `codeBlock`: コードフェンスで囲む
 * - `toggleList`: Markdown にトグルが無いため `<details>` にする。
 *   1 行目を `<summary>`（＝畳んだときに見える見出し）、2 行目以降を中身にする。
 */
export function wrapBlockAction(body: string, action: WrappingBlockAction): string {
    if (action === 'codeBlock') {
        const fence = '```';
        return `${fence}\n${body}\n${fence}`;
    }
    const [summary = '', ...rest] = body.split('\n');
    return `<details>\n<summary>${summary}</summary>\n\n${rest.join('\n')}\n</details>`;
}
