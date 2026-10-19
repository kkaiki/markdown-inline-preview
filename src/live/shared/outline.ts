/**
 * Live モードの目次（ドロワー）の中身（純関数）。設計: docs/specifications/live-mode/outline-drawer-design.md
 *
 * 見出しの判定は描画と同じ `scanSyntaxRanges` を使う（描画と目次で見出しがずれないように。
 * コードブロック・frontmatter の中の `#` はここで既に除かれている）。
 */
import { scanSyntaxRanges } from './syntaxRanges';

/** 目次に出す深さの上限（H1〜H3）。 */
export const OUTLINE_MAX_LEVEL = 3;

export interface OutlineItem {
    level: number;
    /** 記法を外した表示名。 */
    text: string;
    /** 見出しの行の先頭オフセット。 */
    from: number;
    /** 見出しの行末オフセット（クリックでカーソルを置く位置）。 */
    to: number;
}

/** 文書から目次の項目を作る。見出しの中の記法（`**`・リンクの URL など）は外す。 */
export function buildOutline(doc: string): OutlineItem[] {
    const ranges = scanSyntaxRanges(doc);
    const items: OutlineItem[] = [];
    for (const h of ranges) {
        if (h.kind !== 'heading' || (h.level ?? 0) > OUTLINE_MAX_LEVEL) continue;
        // 見出しの本文の中で隠される文字（インライン記法の記号）を除いて表示名にする
        const hidden = ranges
            .filter((r) => r.scope === 'token' && r.revealFrom >= h.markFrom && r.revealTo <= h.markTo)
            .flatMap((r) => r.hidden);
        let text = '';
        for (let i = h.markFrom; i < h.markTo; i++) {
            if (!hidden.some((x) => i >= x.from && i < x.to)) text += doc[i];
        }
        items.push({ level: h.level ?? 1, text: text.trim(), from: h.revealFrom, to: h.revealTo });
    }
    return items;
}

/** オフセット `pos` が属する節（直前の見出し）の添字。最初の見出しより前なら -1。 */
export function currentOutlineIndex(items: OutlineItem[], pos: number): number {
    let found = -1;
    for (let i = 0; i < items.length && items[i].from <= pos; i++) found = i;
    return found;
}
