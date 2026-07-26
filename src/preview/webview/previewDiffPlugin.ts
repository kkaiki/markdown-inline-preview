/**
 * Git HEAD との差分を、各ブロックの左ガターに表示するプラグイン。
 *
 * HEAD 版 Markdown 本文（ホストから受信）を同じ schema でパースし、現在のドキュメントと
 * ブロック単位で差分（[[blockDiff]]）。追加=緑・変更=青のガターバーを node decoration で、
 * 削除はその位置に赤いマーカー（widget）で表示する。
 */
import { parserCtx } from '@milkdown/kit/core';
import type { Ctx } from '@milkdown/ctx';
import type { Node as ProseNode } from '@milkdown/prose/model';
import { Plugin, PluginKey } from '@milkdown/prose/state';
import { Decoration, DecorationSet } from '@milkdown/prose/view';
import { $prose } from '@milkdown/utils';

import { diffBlocks } from '../../shared/markdown/blockDiff';
import { getExpandedBlock } from './blockPrefixEditPlugin';
import { getExpandedCodeFenceRanges } from './codeFenceEditPlugin';
import { getExpandedInlineMarkRanges } from './inlineMarkEditPlugin';

let baseSignatures: string[] | null = null;
let forceUpdate: (() => void) | null = null;

/** シグネチャ本文から除外する絶対位置レンジ。 */
export interface ExpandedRange { from: number; to: number }

/**
 * ブロックごとのシグネチャ（種別＋本文テキスト）配列。テスト容易化のため export。
 *
 * `expandedRanges` を渡すと、その絶対位置レンジ（フォーカスで記法展開中に実テキストとして
 * 挿入されている記法文字）をシグネチャの本文テキストから除外する。対象は 2 系統ある:
 *
 * - ブロックプレフィックス（`blockPrefixEditPlugin`）: `## ` / `- ` / `> ` の 1 レンジ。
 * - インライン記法マーカー（`inlineMarkEditPlugin`）: `` ` `` / `**` / `~~` / `[` /
 *   `](url)` の開き・閉じで複数レンジ。
 *
 * 除外しないと、挿入された記法文字ぶんだけ HEAD 側のシグネチャと食い違い、未編集で
 * フォーカスしただけのブロックが「変更」扱い（青バー）になる。
 */
export function blockSignatures(
    doc: ProseNode,
    expandedRanges?: ExpandedRange | readonly ExpandedRange[] | null
): string[] {
    const ranges: ExpandedRange[] = !expandedRanges
        ? []
        : Array.isArray(expandedRanges)
            ? [...expandedRanges]
            : [expandedRanges as ExpandedRange];

    const sigs: string[] = [];
    doc.forEach((node, offset) => {
        const from = offset;
        const to = offset + node.nodeSize;
        const inside = ranges
            .filter(r => r.from >= from && r.to <= to && r.to > r.from)
            .sort((a, b) => a.from - b.from);

        let text = node.textContent;
        if (inside.length > 0 && node.content.size > 0) {
            const contentStart = from + 1;
            const contentEnd = to - 1;
            let cursor = contentStart;
            let acc = '';
            for (const r of inside) {
                if (r.from < cursor) continue; // 重なりは先勝ちで無視
                acc += doc.textBetween(cursor, Math.min(r.from, contentEnd));
                cursor = Math.min(r.to, contentEnd);
            }
            acc += doc.textBetween(cursor, contentEnd);
            text = acc;
        }
        sigs.push(`${node.type.name} ${text}`);
    });
    return sigs;
}

/** ホストから受け取った HEAD 本文を基準シグネチャに変換して保持する。 */
export function setDiffBase(ctx: Ctx, baseMarkdown: string | null): void {
    if (baseMarkdown === null) {
        baseSignatures = null;
    } else {
        try {
            const doc = ctx.get(parserCtx)(baseMarkdown);
            baseSignatures = doc ? blockSignatures(doc) : null;
        } catch {
            baseSignatures = null;
        }
    }
    forceUpdate?.();
}

function delMarker(): HTMLElement {
    const el = document.createElement('span');
    el.className = 'diff-deleted-marker';
    el.setAttribute('aria-label', 'deleted here');
    el.setAttribute('aria-hidden', 'true');
    return el;
}

export function createPreviewDiffPlugin() {
    return $prose(() => {
        return new Plugin({
            key: new PluginKey('previewDiff'),
            view: (editorView) => {
                forceUpdate = () => editorView.dispatch(editorView.state.tr.setMeta('previewDiff', true));
                return { destroy: () => { forceUpdate = null; } };
            },
            props: {
                decorations(state) {
                    if (!baseSignatures) return DecorationSet.empty;
                    try {
                        // フォーカス展開中に実テキストとして挿入されている記法文字は、
                        // ブロックプレフィックス側・インラインマーク側の両方を除外する
                        // （除外しないとフォーカスしただけで「変更」になる）。
                        const expanded = getExpandedBlock();
                        const expandedRanges: ExpandedRange[] = expanded
                            ? [{ from: expanded.contentStart, to: expanded.contentStart + expanded.prefix.length }]
                            : [];
                        expandedRanges.push(...getExpandedInlineMarkRanges(state.doc));
                        expandedRanges.push(...getExpandedCodeFenceRanges(state.doc));
                        const current = blockSignatures(state.doc, expandedRanges);
                        const { statuses, deletionsBefore } = diffBlocks(baseSignatures, current);

                        const decorations: Decoration[] = [];
                        let index = 0;
                        state.doc.forEach((node, offset) => {
                            const from = offset;
                            const to = offset + node.nodeSize;
                            const status = statuses[index];
                            if (status === 'added') {
                                decorations.push(Decoration.node(from, to, { class: 'diff-added' }));
                            } else if (status === 'modified') {
                                decorations.push(Decoration.node(from, to, { class: 'diff-modified' }));
                            }
                            if (deletionsBefore[index] > 0) {
                                decorations.push(Decoration.widget(from, delMarker, { side: -1, key: `del-${index}` }));
                            }
                            index++;
                        });
                        if (deletionsBefore[current.length] > 0) {
                            decorations.push(Decoration.widget(state.doc.content.size, delMarker, { side: 1, key: 'del-end' }));
                        }

                        return DecorationSet.create(state.doc, decorations);
                    } catch {
                        return DecorationSet.empty;
                    }
                }
            }
        });
    });
}
