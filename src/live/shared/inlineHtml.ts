/**
 * Live モード: インライン HTML（`<span style="…">…</span>` など）の検出と無害化（純関数）。
 *
 * 任意の HTML を webview に通すと、スクリプトや画面を覆う要素を持ち込めてしまう。
 * そこで **タグ・属性・style のプロパティをすべて許可リストで絞り**、
 * 条件を満たさないものはタグごと文字のまま見せる（requirements.md §2.2）。
 */

/** 描画を許すタグ（文字の見た目だけを変えるもの）。 */
const ALLOWED_TAGS = new Set([
    'span', 'mark', 'b', 'strong', 'i', 'em', 'u', 's', 'del', 'ins', 'sub', 'sup', 'small', 'kbd'
]);

/** style で残すプロパティ（位置・大きさを変えて画面を覆えるものは入れない）。 */
const ALLOWED_STYLE = /^(color|background|background-color|font-weight|font-style|font-size|font-family|font-variant|text-decoration(-[a-z]+)?|padding(-(top|right|bottom|left))?|border(-(top|right|bottom|left))?(-(color|style|width))?|border-radius|white-space|letter-spacing|opacity|vertical-align|display)$/;

/** 値に含まれていたら捨てる文字列（外部読み込み・スクリプト・タグの持ち込み）。 */
const FORBIDDEN_VALUE = /url\s*\(|expression\s*\(|javascript:|[<>\\]|@import/i;

/** 描画に使う情報。 */
export interface InlineHtml {
    /** 小文字のタグ名（許可リスト内）。 */
    tag: string;
    /** 無害化済みの style（空なら style なし）。 */
    style: string;
}

/** 走査で見つかったインライン HTML 要素（行内オフセット）。 */
export interface InlineHtmlMatch extends InlineHtml {
    /** 開きタグの終わり（`>` の次）。 */
    openEnd: number;
    /** 閉じタグの始まり。 */
    closeFrom: number;
    /** 閉じタグの終わり。 */
    closeTo: number;
}

/** style 属性の値を、許可したプロパティだけの `prop: value; …` に整える。 */
export function sanitizeInlineStyle(style: string): string {
    const out: string[] = [];
    for (const decl of style.split(';')) {
        const colon = decl.indexOf(':');
        if (colon < 0) continue;
        const prop = decl.slice(0, colon).trim().toLowerCase();
        const value = decl.slice(colon + 1).trim();
        if (value === '' || !ALLOWED_STYLE.test(prop) || FORBIDDEN_VALUE.test(value)) continue;
        out.push(`${prop}: ${value}`);
    }
    return out.join('; ');
}

const OPEN_TAG = /^<([A-Za-z][A-Za-z0-9]*)((?:\s+[A-Za-z_:][-A-Za-z0-9_:.]*(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*>/;
const ATTR = /([A-Za-z_:][-A-Za-z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

/**
 * `text[i]` から始まる許可タグの要素を探す。同じ行に対応する閉じタグが無ければ null。
 * 同じタグの入れ子は深さを数えて対応を取る。
 */
export function matchInlineHtml(text: string, i: number): InlineHtmlMatch | null {
    if (text[i] !== '<') return null;
    const m = OPEN_TAG.exec(text.slice(i));
    if (!m) return null;
    const tag = m[1].toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return null;

    let style = '';
    for (const a of m[2].matchAll(ATTR)) {
        if (a[1].toLowerCase() === 'style') style = sanitizeInlineStyle(a[2] ?? a[3] ?? a[4] ?? '');
    }

    const openEnd = i + m[0].length;
    const tagRe = new RegExp(`<(/?)${tag}(?=[\\s>/])[^>]*>`, 'gi');
    tagRe.lastIndex = openEnd;
    let depth = 1;
    for (let t = tagRe.exec(text); t; t = tagRe.exec(text)) {
        depth += t[1] ? -1 : 1;
        if (depth === 0) {
            return { tag, style, openEnd, closeFrom: t.index, closeTo: t.index + t[0].length };
        }
    }
    return null;
}
