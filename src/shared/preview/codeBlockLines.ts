/**
 * コードブロック内の「行範囲」算出（純粋ロジック・DOM/ProseMirror 非依存）。
 * トリプルクリックでその行だけを選ぶために使う（`codeBlockTripleClick.ts`）。
 */

/**
 * `text` の中で `offset` が属する 1 行（前後の `\n` に挟まれた範囲）の開始・終了オフセット。
 * 改行文字自体は含めない。範囲外の offset はクランプする。
 */
export function lineRangeAt(text: string, offset: number): { start: number; end: number } {
    const clamped = Math.max(0, Math.min(offset, text.length));
    const start = text.lastIndexOf('\n', clamped - 1) + 1; // 直前の \n の次。無ければ 0。
    let end = text.indexOf('\n', clamped);
    if (end === -1) end = text.length;
    return { start, end };
}
