/**
 * 1行ぶんのインライン記法を「表示する文字 + 装飾クラス」に分割する。
 *
 * 表はブロックウィジェットとして描画するため、セルの中身には CodeMirror の
 * decoration が効かない。そのままだと `**太字**` がセルに生のまま出てしまうので、
 * ウィジェット側がこの分割結果を使って同じ見た目を再現する。
 */
import { scanSyntaxRanges, type SyntaxKind } from './syntaxRanges';

export interface InlineSegment {
    /** 画面に出す文字。 */
    text: string;
    /** 当てる装飾クラス（空文字なら地の文）。 */
    classes: string;
}

/** 記法ごとの装飾クラス。decoration 側（liveDecorations.ts）と揃えること。 */
const MARK_CLASS: Partial<Record<SyntaxKind, string>> = {
    strong: 'cm-live-strong',
    em: 'cm-live-em',
    strongEm: 'cm-live-strong cm-live-em',
    strike: 'cm-live-strike',
    highlight: 'cm-live-highlight',
    code: 'cm-live-code',
    link: 'cm-live-link',
    wikilink: 'cm-live-link'
};

export function inlineSegments(text: string): InlineSegment[] {
    if (text === '') return [];

    const hidden = new Array<boolean>(text.length).fill(false);
    const classes = new Array<string>(text.length).fill('');

    for (const r of scanSyntaxRanges(text)) {
        const cls = MARK_CLASS[r.kind];
        if (!cls) continue;
        for (const h of r.hidden) {
            for (let i = h.from; i < h.to; i++) hidden[i] = true;
        }
        for (let i = r.markFrom; i < r.markTo; i++) {
            classes[i] = classes[i] ? `${classes[i]} ${cls}` : cls;
        }
    }

    const out: InlineSegment[] = [];
    for (let i = 0; i < text.length; i++) {
        if (hidden[i]) continue;
        const last = out[out.length - 1];
        if (last && last.classes === classes[i]) last.text += text[i];
        else out.push({ text: text[i], classes: classes[i] });
    }
    return out;
}
