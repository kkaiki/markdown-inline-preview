/**
 * Notion 準拠のブロック操作（⌘D 複製 / ⌘⇧↑↓ 移動）。
 *
 * Notion の「ブロック」に相当するのは、Markdown では「その行 + インデントで
 * ぶら下がっている子行」。したがって複製も移動も子を連れていく。
 *
 * ここは「どの行範囲を、どの文字列で置き換えるか」だけを返す純関数にしてある。
 * VS Code の `TextEditor.edit` にも CodeMirror の `dispatch` にもそのまま渡せるうえ、
 * 文書全体を置き換えないのでカーソルや外部同期を壊さない。
 *
 * 仕様: docs/specifications/notion-shortcuts.md §1.3
 */

/** 行範囲の置き換え1回分。行番号はすべて 0 始まり・両端を含む。 */
export interface BlockEdit {
    /** 置き換える先頭行。 */
    fromLine: number;
    /** 置き換える末尾行。 */
    toLine: number;
    /** 置き換え後のテキスト（改行区切り）。 */
    text: string;
    /** 置き換え後にカーソル/選択を置く先頭行。 */
    selectionFromLine: number;
    /** 置き換え後にカーソル/選択を置く末尾行。 */
    selectionToLine: number;
}

/** `- [ ] ` / `* [x] ` のようなチェックボックス項目。 */
const TASK_RE = /^([ \t]*[-*+] )\[([ xX])\](.*)$/;
/** チェックボックスではない、ただの箇条書き項目。 */
const BULLET_RE = /^([ \t]*[-*+] )(.*)$/;

/**
 * ⌘Enter: チェックボックスを切り替える。
 *
 * Notion の ⌘Enter は「そのブロックを操作する」（チェック・トグル開閉）なので、
 * チェックボックスでない箇条書きは**チェックボックスに変える**のが自然な対応。
 * リストですらない行は `null`（呼び出し側でエディタ既定の動作に委ねる）。
 */
export function toggleTaskLine(line: string): string | null {
    const task = TASK_RE.exec(line);
    if (task) {
        const next = task[2] === ' ' ? 'x' : ' ';
        return `${task[1]}[${next}]${task[3]}`;
    }
    const bullet = BULLET_RE.exec(line);
    if (bullet) return `${bullet[1]}[ ] ${bullet[2]}`;
    return null;
}

/** 行頭の空白の長さ。 */
function indentWidth(line: string): number {
    const m = /^[ \t]*/.exec(line);
    return m ? m[0].length : 0;
}

/**
 * `to` 行のブロックがどこまで続くかを返す（自分より深くインデントされた行を子として含む）。
 * 空行に当たったらそこで打ち切る（Notion のブロックは空行をまたがない）。
 */
function blockEndLine(lines: string[], from: number, to: number): number {
    const base = indentWidth(lines[from] ?? '');
    let end = to;
    for (let i = to + 1; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim() === '') break;
        if (indentWidth(line) <= base) break;
        end = i;
    }
    return end;
}

/** ⌘D: カーソル行（選択があればその範囲）のブロックを子ごと直下に複製する。 */
export function duplicateBlock(lines: string[], from: number, to: number): BlockEdit {
    const end = blockEndLine(lines, from, to);
    const block = lines.slice(from, end + 1);
    const height = block.length;
    return {
        fromLine: from,
        toLine: end,
        text: [...block, ...block].join('\n'),
        selectionFromLine: from + height,
        selectionToLine: end + height
    };
}

/**
 * ⌘⇧↑ / ⌘⇧↓: ブロックを子ごと 1 行分だけ上下に移動する。
 * 移動先が無い（文書の先頭/末尾）場合は `null`。
 */
export function moveBlock(
    lines: string[],
    from: number,
    to: number,
    direction: 'up' | 'down'
): BlockEdit | null {
    const end = blockEndLine(lines, from, to);
    const block = lines.slice(from, end + 1);

    if (direction === 'up') {
        if (from === 0) return null;
        const above = lines[from - 1];
        return {
            fromLine: from - 1,
            toLine: end,
            text: [...block, above].join('\n'),
            selectionFromLine: from - 1,
            selectionToLine: to - 1
        };
    }

    if (end >= lines.length - 1) return null;
    const below = lines[end + 1];
    return {
        fromLine: from,
        toLine: end + 1,
        text: [below, ...block].join('\n'),
        selectionFromLine: from + 1,
        selectionToLine: to + 1
    };
}
