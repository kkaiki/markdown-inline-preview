/**
 * Notion 準拠のインライン書式（⌘B / ⌘I / ⌘U / ⌘E / ⌘⇧S / ⌘K / ⌘⇧M / ⌘⇧H）。
 *
 * 「選択テキスト → 置き換える文字列とカーソル位置」だけを扱う純関数を置く。
 * Raw（VS Code TextEditor）と Live（CodeMirror）の両方がここを呼ぶことで、
 * 同じキーを押したときに両モードで必ず同じ Markdown になる。
 *
 * 仕様: docs/specifications/notion-shortcuts.md §1.1
 */

/** Notion のインライン書式ショートカットの種類。 */
export type InlineFormat =
    | 'bold'
    | 'italic'
    | 'underline'
    | 'strikethrough'
    | 'code'
    | 'highlight'
    | 'comment'
    | 'link';

export interface InlineFormatResult {
    /** 選択範囲を置き換える文字列。 */
    insert: string;
    /** 置き換え後の選択開始（`insert` の先頭からの相対位置）。 */
    selectionStart: number;
    /** 置き換え後の選択終了。`selectionStart` と同じならカーソルのみ。 */
    selectionEnd: number;
    /** 置き換える範囲を選択の**左**へ何文字広げるか（記号が選択の外側にある場合）。 */
    extendBefore: number;
    /** 置き換える範囲を選択の**右**へ何文字広げるか。 */
    extendAfter: number;
}

/** 書式ごとの開き記号・閉じ記号。 */
const MARKERS: Record<Exclude<InlineFormat, 'link'>, { open: string; close: string }> = {
    bold: { open: '**', close: '**' },
    italic: { open: '*', close: '*' },
    underline: { open: '<u>', close: '</u>' },
    strikethrough: { open: '~~', close: '~~' },
    code: { open: '`', close: '`' },
    highlight: { open: '==', close: '==' },
    // Notion のコメントは議論スレッドだが、Markdown ファイル内に閉じた等価物は
    // HTML コメントしかないため、これを採用する（仕様 §1.1）。
    comment: { open: '<!-- ', close: ' -->' }
};

/** `[text](url)` 形式のリンク全体にちょうど一致するか。 */
const LINK_RE = /^\[([^\]]*)\]\([^)]*\)$/;

/**
 * 選択テキストに書式を当てる（既に当たっていれば外す）。
 *
 * - 選択あり: 記号で囲み、囲んだ中身を選択したまま残す
 * - 選択が既に囲まれている: 記号を外し、中身を選択したまま残す
 * - **選択の「外側」が記号**（囲んだ直後の状態）: 記号を外す。
 *   このとき置き換える範囲を選択の左右へ広げる必要があるので `extendBefore` /
 *   `extendAfter` で返す。これが無いと ⌘B を2回押したときに `****選択****` と
 *   二重に囲まれてしまう。
 * - 選択が空: 記号だけを挿入し、カーソルを内側に置く
 *
 * @param before 選択の直前のテキスト（同じ行の先頭からで十分）
 * @param after  選択の直後のテキスト（同じ行の末尾までで十分）
 */
export function applyInlineFormat(
    selected: string,
    format: InlineFormat,
    before = '',
    after = ''
): InlineFormatResult {
    if (format === 'link') return applyLink(selected);

    const { open, close } = MARKERS[format];

    // 選択そのものが記号を含んでいる
    if (isWrapped(selected, open, close)) {
        const inner = selected.slice(open.length, selected.length - close.length);
        return { insert: inner, selectionStart: 0, selectionEnd: inner.length, extendBefore: 0, extendAfter: 0 };
    }

    // 記号が選択の外側にある（囲んだ直後にもう一度押した場合）
    if (before.endsWith(open) && after.startsWith(close)) {
        return {
            insert: selected,
            selectionStart: 0,
            selectionEnd: selected.length,
            extendBefore: open.length,
            extendAfter: close.length
        };
    }

    return {
        insert: `${open}${selected}${close}`,
        selectionStart: open.length,
        selectionEnd: open.length + selected.length,
        extendBefore: 0,
        extendAfter: 0
    };
}

/** `open`〜`close` でちょうど囲まれているか（記号だけの空リンクも「囲まれている」扱い）。 */
function isWrapped(text: string, open: string, close: string): boolean {
    return text.length >= open.length + close.length && text.startsWith(open) && text.endsWith(close);
}

/**
 * ⌘K。選択をリンクテキストにして、カーソルは URL を打つ位置へ置く。
 * 既にリンクなら外してテキストだけ残す。
 */
function applyLink(selected: string): InlineFormatResult {
    const m = LINK_RE.exec(selected);
    if (m) {
        const text = m[1];
        return { insert: text, selectionStart: 0, selectionEnd: text.length, extendBefore: 0, extendAfter: 0 };
    }
    if (selected === '') {
        // 何も選んでいないときは、まずリンクテキストを打たせる
        return { insert: '[]()', selectionStart: 1, selectionEnd: 1, extendBefore: 0, extendAfter: 0 };
    }
    const insert = `[${selected}]()`;
    const urlAt = selected.length + 3; // "[" + text + "](" の直後
    return { insert, selectionStart: urlAt, selectionEnd: urlAt, extendBefore: 0, extendAfter: 0 };
}
