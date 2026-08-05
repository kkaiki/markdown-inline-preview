/**
 * Live モードの記法スキャナ: 生 Markdown 文字列から「記法トークンの範囲」を切り出す。
 *
 * Live モードは Markdown を別のドキュメントモデルへ変換しない（requirements.md R1.1）。
 * ここで得た範囲へ CodeMirror の decoration を当てて、
 *   - `hidden`: 収縮時に消す（または透明化する）記法文字
 *   - `markFrom`/`markTo`: 装飾を当てる本文
 *   - `revealFrom`/`revealTo`: 展開判定に使う範囲（revealScope.ts が使う）
 * を表現する。
 *
 * 現在の対応範囲は Phase 1（見出し + インライン記法 + リンク）。
 * リスト・引用・チェックボックス・ブロック要素は Phase 2 以降で足す。
 */
import type { RevealScope } from './revealScope';
import { parseLinePrefix, parseQuotePrefix } from './liveEditing';
import { isTableDelimiterRow } from './tableCells';
import { findFenceBlocks } from './fenceBlocks';

export type SyntaxKind =
    | 'heading'
    | 'strong'
    | 'em'
    | 'strongEm'
    | 'strike'
    | 'highlight'
    | 'code'
    | 'link'
    | 'wikilink'
    | 'image'
    | 'listMarker'
    | 'orderedMarker'
    | 'task'
    | 'quoteMarker'
    | 'codeFence'
    | 'table'
    | 'horizontalRule'
    | 'frontmatter'
    | 'mathBlock'
    | 'callout'
    | 'inlineMath';

/** 収縮時に隠す文字の範囲。 */
export interface HiddenRange {
    from: number;
    to: number;
}

export interface SyntaxRange {
    kind: SyntaxKind;
    scope: RevealScope;
    /** 収縮時に隠す記法文字（前後のマーカーなど）。 */
    hidden: HiddenRange[];
    /** 展開判定の範囲（この位置も含む）。 */
    revealFrom: number;
    revealTo: number;
    /** 装飾を当てる本文の範囲。 */
    markFrom: number;
    markTo: number;
    /** 見出しのレベル（1〜6）／リスト・引用のネスト段数。それ以外では undefined。 */
    level?: number;
    /** チェックボックスの状態（kind === 'task' のときだけ）。 */
    checked?: boolean;
    /**
     * 記法ごとの付随情報。
     * codeFence: 言語 / mathBlock・inlineMath: 数式本体 / callout: 種別 / image: URL。
     */
    info?: string;
}

/** 対になるインライン記法の定義（開き記号 = 閉じ記号のもの）。 */
const PAIRED: { marker: string; kind: SyntaxKind }[] = [
    { marker: '***', kind: 'strongEm' },
    { marker: '___', kind: 'strongEm' },
    { marker: '**', kind: 'strong' },
    { marker: '__', kind: 'strong' },
    { marker: '~~', kind: 'strike' },
    { marker: '==', kind: 'highlight' },
    { marker: '*', kind: 'em' },
    { marker: '_', kind: 'em' }
];

/** 表の行らしいか（パイプを含む）。 */
function isTableRow(line: string): boolean {
    return /\|/.test(line) && line.trim() !== '';
}

/** 水平線の行か（`---` `***` `___` が3つ以上、それだけの行）。 */
function isHorizontalRule(line: string): boolean {
    return /^\s{0,3}(-{3,}|\*{3,}|_{3,})\s*$/.test(line);
}

/** frontmatter の範囲（先頭が `---` で、後続に閉じの `---` があるとき）。 */
function findFrontmatter(lines: string[]): { startLine: number; endLine: number } | null {
    if (lines.length === 0 || lines[0].trim() !== '---') return null;
    for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim() === '---') return { startLine: 0, endLine: i };
    }
    return null;
}

/** 数式ブロック（`$$` だけの行に挟まれた範囲）。 */
function findMathBlocks(lines: string[], skip: boolean[]): { startLine: number; endLine: number }[] {
    const blocks: { startLine: number; endLine: number }[] = [];
    for (let i = 0; i < lines.length; i++) {
        if (skip[i] || lines[i].trim() !== '$$') continue;
        for (let j = i + 1; j < lines.length; j++) {
            if (skip[j]) break;
            if (lines[j].trim() === '$$') {
                blocks.push({ startLine: i, endLine: j });
                i = j;
                break;
            }
        }
    }
    return blocks;
}

/** コールアウト（`> [!type]` で始まり、続く `>` 行までを1ブロックとする）。 */
function findCallouts(
    lines: string[],
    skip: boolean[]
): { startLine: number; endLine: number; type: string }[] {
    const blocks: { startLine: number; endLine: number; type: string }[] = [];
    for (let i = 0; i < lines.length; i++) {
        if (skip[i]) continue;
        const m = /^>\s*\[!([A-Za-z-]+)\]/.exec(lines[i]);
        if (!m) continue;
        let end = i;
        while (end + 1 < lines.length && !skip[end + 1] && /^>/.test(lines[end + 1])) end += 1;
        blocks.push({ startLine: i, endLine: end, type: m[1].toLowerCase() });
        i = end;
    }
    return blocks;
}

/** 表ブロック（行番号は 0 始まり、`endLine` を含む）。 */
interface TableBlock {
    startLine: number;
    endLine: number;
}

/**
 * 表ブロックを列挙する。「パイプを含む行 → 区切り行」の並びで始まり、
 * パイプを含む行が続く限り1つのブロックとして扱う。
 */
function findTableBlocks(lines: string[], skip: boolean[]): TableBlock[] {
    const blocks: TableBlock[] = [];
    for (let i = 0; i + 1 < lines.length; i++) {
        if (skip[i] || skip[i + 1]) continue;
        if (!isTableRow(lines[i]) || !isTableDelimiterRow(lines[i + 1])) continue;
        let end = i + 1;
        while (end + 1 < lines.length && !skip[end + 1] && isTableRow(lines[end + 1])) end += 1;
        blocks.push({ startLine: i, endLine: end });
        i = end;
    }
    return blocks;
}

/**
 * 1行ぶんのインライン記法を走査して `out` へ積む。
 *
 * @param text 行のテキスト（改行を含まない）
 * @param base この行の先頭のドキュメントオフセット
 */
function scanInline(text: string, base: number, out: SyntaxRange[]): void {
    let i = 0;
    while (i < text.length) {
        const ch = text[i];

        // バックスラッシュエスケープ: 次の1文字は記法として扱わない。
        if (ch === '\\') {
            i += 2;
            continue;
        }

        // インラインコードが最優先（中身は他の記法として解釈しない）。
        if (ch === '`') {
            const runMatch = /^`+/.exec(text.slice(i));
            const run = runMatch ? runMatch[0] : '`';
            const close = text.indexOf(run, i + run.length);
            if (close !== -1 && close > i + run.length) {
                out.push({
                    kind: 'code',
                    scope: 'token',
                    hidden: [
                        { from: base + i, to: base + i + run.length },
                        { from: base + close, to: base + close + run.length }
                    ],
                    revealFrom: base + i,
                    revealTo: base + close + run.length,
                    markFrom: base + i + run.length,
                    markTo: base + close
                });
                i = close + run.length;
                continue;
            }
            i += run.length;
            continue;
        }

        // インライン数式 $…$（閉じ "$" が同じ行にあるときだけ）
        if (ch === '$' && text[i + 1] !== '$') {
            const close = indexOfUnescaped(text, '$', i + 1);
            if (close !== -1 && close > i + 1) {
                out.push({
                    kind: 'inlineMath',
                    scope: 'token',
                    hidden: [
                        { from: base + i, to: base + i + 1 },
                        { from: base + close, to: base + close + 1 }
                    ],
                    revealFrom: base + i,
                    revealTo: base + close + 1,
                    markFrom: base + i + 1,
                    markTo: base + close,
                    info: text.slice(i + 1, close)
                });
                i = close + 1;
                continue;
            }
        }

        // 画像 / リンク / Wikilink
        if (ch === '[' || (ch === '!' && text[i + 1] === '[')) {
            const consumed = scanBracket(text, i, base, out);
            if (consumed > 0) {
                i += consumed;
                continue;
            }
        }

        // 対になるインライン記法
        const paired = matchPaired(text, i);
        if (paired) {
            const { marker, kind } = paired;
            const contentFrom = i + marker.length;
            const close = findClosing(text, marker, contentFrom);
            if (close !== -1) {
                out.push({
                    kind,
                    scope: 'token',
                    hidden: [
                        { from: base + i, to: base + contentFrom },
                        { from: base + close, to: base + close + marker.length }
                    ],
                    revealFrom: base + i,
                    revealTo: base + close + marker.length,
                    markFrom: base + contentFrom,
                    markTo: base + close
                });
                i = close + marker.length;
                continue;
            }
        }

        i += 1;
    }
}

/** 位置 `i` から始まる対記法を返す（長いマーカー優先）。 */
function matchPaired(text: string, i: number): { marker: string; kind: SyntaxKind } | null {
    for (const p of PAIRED) {
        if (text.startsWith(p.marker, i)) return p;
    }
    return null;
}

/** `marker` の閉じ位置を探す（エスケープを尊重し、中身が空のものは認めない）。 */
function findClosing(text: string, marker: string, from: number): number {
    for (let j = from; j <= text.length - marker.length; j++) {
        if (text[j] === '\\') {
            j += 1;
            continue;
        }
        if (text.startsWith(marker, j) && j > from) return j;
    }
    return -1;
}

/**
 * `[`, `![`, `[[` で始まる記法を走査する。消費した文字数を返す（不成立なら 0）。
 */
function scanBracket(text: string, i: number, base: number, out: SyntaxRange[]): number {
    const isImage = text[i] === '!';
    const open = isImage ? i + 1 : i;

    // Wikilink / 埋め込み: [[...]]
    if (text.startsWith('[[', open)) {
        const close = text.indexOf(']]', open + 2);
        if (close === -1) return 0;
        out.push({
            kind: isImage ? 'image' : 'wikilink',
            scope: 'token',
            hidden: [
                { from: base + i, to: base + open + 2 },
                { from: base + close, to: base + close + 2 }
            ],
            revealFrom: base + i,
            revealTo: base + close + 2,
            markFrom: base + open + 2,
            markTo: base + close
        });
        return close + 2 - i;
    }

    // 脚注参照 [^1] はリンクではない（実測: 常に生表示）。
    if (text[open + 1] === '^') return 0;

    const closeBracket = indexOfUnescaped(text, ']', open + 1);
    if (closeBracket === -1) return 0;
    if (text[closeBracket + 1] !== '(') return 0;
    const closeParen = indexOfUnescaped(text, ')', closeBracket + 2);
    if (closeParen === -1) return 0;

    out.push({
        kind: isImage ? 'image' : 'link',
        scope: 'token',
        hidden: [
            { from: base + i, to: base + open + 1 },
            { from: base + closeBracket, to: base + closeParen + 1 }
        ],
        revealFrom: base + i,
        revealTo: base + closeParen + 1,
        markFrom: base + open + 1,
        markTo: base + closeBracket,
        info: text.slice(closeBracket + 2, closeParen)
    });
    return closeParen + 1 - i;
}

function indexOfUnescaped(text: string, target: string, from: number): number {
    for (let j = from; j < text.length; j++) {
        if (text[j] === '\\') {
            j += 1;
            continue;
        }
        if (text[j] === target) return j;
    }
    return -1;
}

/**
 * 行頭のリスト系プレフィックス（箇条書き・番号リスト・チェックボックス）を積む。
 *
 * 実測どおり、箇条書きと番号リストは **never スコープ**（カーソルが来ても生記号に
 * 戻さない）で、文字自体は消さずに透明化して幅を残す（hidden は空）。
 * チェックボックスだけは **token スコープ**で "- [ ]" の5文字を置換する。
 */
function pushListPrefix(body: string, base: number, out: SyntaxRange[]): void {
    const p = parseLinePrefix(body);
    if (p.kind === 'none') return;

    if (p.kind === 'task') {
        const markerLen = p.indent.length + 5; // "- [ ]" の5文字（後ろの空白は残す）
        out.push({
            kind: 'task',
            scope: 'token',
            hidden: [{ from: base + p.indent.length, to: base + markerLen }],
            revealFrom: base + p.indent.length,
            revealTo: base + markerLen,
            markFrom: base + p.contentStart,
            markTo: base + body.length,
            level: p.level,
            checked: p.checked
        });
        return;
    }

    // マーカー文字（"-" や "1." ）だけを装飾対象にする。後ろの空白は素のまま。
    const markerFrom = base + p.indent.length;
    const markerTo = markerFrom + p.marker.trimEnd().length;
    out.push({
        kind: p.kind === 'ordered' ? 'orderedMarker' : 'listMarker',
        scope: 'never',
        hidden: [],
        revealFrom: markerFrom,
        revealTo: markerTo,
        markFrom: markerFrom,
        markTo: markerTo,
        level: p.level
    });
}

/**
 * ドキュメント全体を走査して記法トークンの一覧を返す。
 * 返り値は `revealFrom` の昇順ではなく、行順 → 行内の出現順になる。
 */
export function scanSyntaxRanges(doc: string): SyntaxRange[] {
    const out: SyntaxRange[] = [];
    const lines = doc.split('\n');

    // 行頭オフセットを先に求める
    const lineFrom: number[] = [];
    let acc = 0;
    for (const line of lines) {
        lineFrom.push(acc);
        acc += line.length + 1;
    }
    const lineTo = (n: number): number => lineFrom[n] + lines[n].length;

    // 走査対象外の行（コードフェンス・表）を印付けする
    const skip: boolean[] = lines.map(() => false);

    for (const b of findFenceBlocks(lines)) {
        const last = b.closeLine ?? lines.length - 1;
        for (let n = b.openLine; n <= last; n++) skip[n] = true;
        const hidden: HiddenRange[] = [{ from: lineFrom[b.openLine], to: lineTo(b.openLine) }];
        if (b.closeLine !== null) hidden.push({ from: lineFrom[b.closeLine], to: lineTo(b.closeLine) });
        out.push({
            kind: 'codeFence',
            scope: 'block',
            hidden,
            revealFrom: lineFrom[b.openLine],
            revealTo: b.closeLine !== null ? lineTo(b.closeLine) : doc.length,
            markFrom: lineFrom[b.openLine],
            markTo: b.closeLine !== null ? lineTo(b.closeLine) : doc.length,
            info: b.info
        });
    }

    const fm = findFrontmatter(lines);
    if (fm) {
        for (let n = fm.startLine; n <= fm.endLine; n++) skip[n] = true;
        out.push({
            kind: 'frontmatter',
            scope: 'never',
            hidden: [],
            revealFrom: lineFrom[fm.startLine],
            revealTo: lineTo(fm.endLine),
            markFrom: lineFrom[fm.startLine],
            markTo: lineTo(fm.endLine)
        });
    }

    for (const b of findMathBlocks(lines, skip)) {
        for (let n = b.startLine; n <= b.endLine; n++) skip[n] = true;
        const from = lineFrom[b.startLine];
        const to = lineTo(b.endLine);
        out.push({
            // 数式はソースを畳まず、下にプレビューを併記する（mermaid と同じ見せ方）。
            // 「普通の部分は編集しやすいように」というユーザー指示（2026-08-05）による。
            kind: 'mathBlock',
            scope: 'never',
            hidden: [],
            revealFrom: from,
            revealTo: to,
            markFrom: from,
            markTo: to,
            info: lines.slice(b.startLine + 1, b.endLine).join('\n')
        });
    }

    for (const b of findCallouts(lines, skip)) {
        for (let n = b.startLine; n <= b.endLine; n++) skip[n] = true;
        const from = lineFrom[b.startLine];
        const to = lineTo(b.endLine);
        out.push({
            kind: 'callout',
            scope: 'block',
            hidden: [{ from, to }],
            revealFrom: from,
            revealTo: to,
            markFrom: from,
            markTo: to,
            info: b.type
        });
    }

    for (const b of findTableBlocks(lines, skip)) {
        for (let n = b.startLine; n <= b.endLine; n++) skip[n] = true;
        const from = lineFrom[b.startLine];
        const to = lineTo(b.endLine);
        out.push({
            // 実測どおり、表は常時レンダリングしてセルの中で直接編集する（Phase 4b）
            kind: 'table',
            scope: 'never',
            hidden: [{ from, to }],
            revealFrom: from,
            revealTo: to,
            markFrom: from,
            markTo: to
        });
    }

    for (let ln = 0; ln < lines.length; ln++) {
        if (skip[ln]) continue;
        const line = lines[ln];
        const offset = lineFrom[ln];

        // 水平線（行スコープ）
        if (isHorizontalRule(line)) {
            out.push({
                kind: 'horizontalRule',
                scope: 'line',
                hidden: [{ from: offset, to: offset + line.length }],
                revealFrom: offset,
                revealTo: offset + line.length,
                markFrom: offset,
                markTo: offset + line.length
            });
            continue;
        }

        // 引用マーカー（常時変換。">" は消さずに透明化して幅を残す）
        let bodyOffset = offset;
        let body = line;
        const quote = parseQuotePrefix(line);
        if (quote) {
            out.push({
                kind: 'quoteMarker',
                scope: 'never',
                hidden: [],
                revealFrom: offset,
                revealTo: offset + quote.prefix.length,
                markFrom: offset,
                markTo: offset + quote.prefix.length,
                level: quote.level
            });
            bodyOffset = offset + quote.prefix.length;
            body = line.slice(quote.prefix.length);
        }

        // 見出し（行スコープ）
        const h = /^(#{1,6}) /.exec(body);
        if (h) {
            const level = h[1].length;
            out.push({
                kind: 'heading',
                scope: 'line',
                hidden: [{ from: bodyOffset, to: bodyOffset + level + 1 }],
                revealFrom: offset,
                revealTo: offset + line.length,
                markFrom: bodyOffset + level + 1,
                markTo: offset + line.length,
                level
            });
        }

        pushListPrefix(body, bodyOffset, out);
        scanInline(line, offset, out);
    }
    return out;
}
