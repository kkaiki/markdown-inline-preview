/**
 * Cmd+A 段階選択で使う「カーソルを囲む括弧の中身」検出。
 * Raw（navigation.ts）と Preview（previewKeymapPlugin.ts）の両方から共有される。
 */

export interface BracketContentRange {
    start: number;
    end: number;
}

const CLOSE_FOR_OPEN: Record<string, string> = { '(': ')', '[': ']' };

/**
 * `text` 内で `cursor` を囲む最も内側の `(...)` / `[...]` の中身の範囲を返す。
 * 対応する括弧が無ければ `null`。開き括弧の直前・閉じ括弧の直後は「外」とみなす。
 * 対応しない閉じ括弧はスタックに触れず無視する（1つ外側の開き括弧とペアを試みる）。
 */
export function findEnclosingBracketContent(text: string, cursor: number): BracketContentRange | null {
    const stack: { char: string; pos: number }[] = [];
    let best: BracketContentRange | null = null;

    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (c === '(' || c === '[') {
            stack.push({ char: c, pos: i });
            continue;
        }
        if (c === ')' || c === ']') {
            const top = stack[stack.length - 1];
            if (!top || CLOSE_FOR_OPEN[top.char] !== c) continue;
            stack.pop();

            const start = top.pos + 1;
            const end = i;
            if (cursor > top.pos && cursor <= end) {
                if (!best || end - start < best.end - best.start) {
                    best = { start, end };
                }
            }
        }
    }

    return best;
}
