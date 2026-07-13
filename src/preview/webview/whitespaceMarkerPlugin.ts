/**
 * 空白のみコンテンツの可視化（ProseMirror デコレーション方式）。
 *
 * ユーザー報告: 「行に文字がなく全角スペース「　」だけ／表セルの中に「　」だけ／
 * 行末に「　」等が入っている」場合、Preview 上では見た目上の空白と区別が付かない。
 * `mathDecorationPlugin.ts` と同じデコレーション方式（表示専用・doc 不変更）でこれらを
 * マークする。
 *
 * 対象の3ケース（詳細: docs/specifications/whitespace-only-content-visualization.md）:
 *   1. テキストブロックの内容が空白文字（半角スペース／全角スペース／タブ）だけ
 *   2. 表セルの中身が空白文字だけ（GFM の table_cell/table_header は内部に段落を1つ
 *      持つ構造なので、ケース1の判定がそのまま適用される）
 *   3. テキストブロック末尾に付いた空白文字（本文はあるが末尾に余分な空白がある場合）
 *
 * 対象外:
 *   - `blankLineRemarkPlugin.ts` が空行本数の往復のために作る「真に空」（テキストノードを
 *     一切持たない）の paragraph。このプラグインが見るのは「1文字以上の空白文字を
 *     持つテキストノード」であり、ゼロ文字のノードはそもそもマッチしない。
 *   - `code_block` およびインラインコード（`inlineCode`/`code_inline` マーク）の内容。
 *     ソースの逐語的な表現なので一切マークしない
 *     （`mathDecorationPlugin.ts` / `trailingNbspFixPlugin.ts` と同じ除外方針）。
 */
import { Plugin, PluginKey } from '@milkdown/prose/state';
import type { Node as ProseNode } from '@milkdown/prose/model';
import { Decoration, DecorationSet } from '@milkdown/prose/view';
import { $prose } from '@milkdown/utils';

// 半角スペース／タブ／全角スペース（U+3000）。
const WHITESPACE_ONLY_RE = /^[ \t　]+$/;
const TRAILING_WHITESPACE_RE = /[ \t　]+$/;

interface InlineRun {
    /** テキストノードなら文字列、それ以外（画像等の非テキストインラインノード）なら null。 */
    text: string | null;
    from: number;
    to: number;
    isCode: boolean;
}

function isCodeMarked(node: ProseNode): boolean {
    return node.marks.some((mark) => mark.type.name === 'inlineCode' || mark.type.name === 'code_inline');
}

function collectRuns(node: ProseNode, contentStart: number): InlineRun[] {
    const runs: InlineRun[] = [];
    node.forEach((child, offset) => {
        const from = contentStart + offset;
        const to = from + child.nodeSize;
        if (child.isText && typeof child.text === 'string') {
            runs.push({ text: child.text, from, to, isCode: isCodeMarked(child) });
        } else {
            runs.push({ text: null, from, to, isCode: false });
        }
    });
    return runs;
}

/** ブロック内容全体が空白文字だけか判定する。表セル（内部の段落）にも同じ判定が使われる。 */
function wholeBlockWhitespaceRange(runs: InlineRun[]): { from: number; to: number } | null {
    if (runs.length === 0) return null;
    if (runs.some((run) => run.text === null || run.isCode)) return null;
    const combined = runs.map((run) => run.text).join('');
    if (combined.length === 0 || !WHITESPACE_ONLY_RE.test(combined)) return null;
    return { from: runs[0].from, to: runs[runs.length - 1].to };
}

/** 末尾から連続する空白文字ランを求める。非テキスト/コードのランに当たったら打ち切る。 */
function trailingWhitespaceRange(runs: InlineRun[]): { from: number; to: number } | null {
    let from: number | null = null;
    let to: number | null = null;

    for (let i = runs.length - 1; i >= 0; i--) {
        const run = runs[i];
        if (run.text === null || run.isCode) break;

        if (run.text.length > 0 && WHITESPACE_ONLY_RE.test(run.text)) {
            // ラン全体が空白 → さらに前のランへ遡って連結する。
            to ??= run.to;
            from = run.from;
            continue;
        }

        // ラン自体は本文を含む。末尾の空白部分だけを見て打ち切る。
        const match = TRAILING_WHITESPACE_RE.exec(run.text);
        if (match) {
            to ??= run.to;
            from = run.to - match[0].length;
        }
        break;
    }

    if (from === null || to === null) return null;
    return { from, to };
}

export function buildWhitespaceDecorations(doc: ProseNode): DecorationSet {
    const decorations: Decoration[] = [];

    doc.descendants((node, pos) => {
        if (node.type.name === 'code_block') return false;
        if (!node.isTextblock) return true;

        const runs = collectRuns(node, pos + 1);

        const whole = wholeBlockWhitespaceRange(runs);
        if (whole) {
            decorations.push(Decoration.inline(whole.from, whole.to, { class: 'ipreview-whitespace-marker' }));
            return true;
        }

        const trailing = trailingWhitespaceRange(runs);
        if (trailing) {
            decorations.push(Decoration.inline(trailing.from, trailing.to, { class: 'ipreview-whitespace-marker' }));
        }
        return true;
    });

    return DecorationSet.create(doc, decorations);
}

const whitespaceMarkerKey = new PluginKey<DecorationSet>('whitespaceMarker');

export function createWhitespaceMarkerPlugin() {
    return $prose(() => new Plugin({
        key: whitespaceMarkerKey,
        props: {
            decorations(state) {
                return buildWhitespaceDecorations(state.doc);
            }
        }
    }));
}
