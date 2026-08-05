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

let baseSignatures: string[] | null = null;
let forceUpdate: (() => void) | null = null;

/**
 * ブロックごとのシグネチャ（種別＋本文テキスト）配列。テスト容易化のため export。
 *
 * Preview はフォーカスしても Markdown 記法を実テキストとして挿入しない（記法の実テキスト
 * 展開は 2026-07-26 に廃止）ため、本文テキストをそのまま比較すればよい。展開時代は
 * 挿入された記法文字を除外しないと、フォーカスしただけのブロックが「変更（青バー）」に
 * なってしまっていた（docs/specifications/no-focus-expand.md）。
 */
export function blockSignatures(doc: ProseNode): string[] {
    const sigs: string[] = [];
    doc.forEach((node) => {
        sigs.push(`${node.type.name} ${node.textContent}`);
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
                        const current = blockSignatures(state.doc);
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
