/**
 * 画像とテキストが同一段落に混在するのを防ぐプラグイン。
 *
 * appendTransaction で文書変更を監視し、テキスト+画像が混在する段落を
 * 「テキストのみ」「画像のみ」の複数段落に自動分割する。
 */

import { Plugin, PluginKey } from '@milkdown/prose/state';
import { Fragment } from '@milkdown/prose/model';
import type { Node as PMNode } from '@milkdown/prose/model';
import { $prose } from '@milkdown/utils';

const imageIsolationKey = new PluginKey('imageIsolation');

/**
 * 段落が画像とテキストを両方含む場合、「画像のみ」「テキストのみ」の
 * 連続グループに分割した段落配列を返す。混在していなければ null。
 */
function splitMixedParagraph(node: PMNode): PMNode[] | null {
    let hasImage = false;
    let hasNonImage = false;
    node.forEach(child => {
        if (child.type.name === 'image') hasImage = true;
        else hasNonImage = true;
    });
    if (!hasImage || !hasNonImage) return null;

    const segments: PMNode[][] = [];
    let current: PMNode[] = [];
    let lastIsImage: boolean | null = null;

    node.forEach(child => {
        const isImage = child.type.name === 'image';
        if (lastIsImage !== null && isImage !== lastIsImage) {
            segments.push(current);
            current = [child];
        } else {
            current.push(child);
        }
        lastIsImage = isImage;
    });
    if (current.length > 0) segments.push(current);
    if (segments.length <= 1) return null;

    const paragraphType = node.type.schema.nodes['paragraph'];
    return segments.map(nodes => paragraphType.create(null, Fragment.fromArray(nodes)));
}

export const imageIsolationPlugin = $prose(() => new Plugin({
    key: imageIsolationKey,
    appendTransaction(transactions, _oldState, newState) {
        if (!transactions.some(tr => tr.docChanged)) return null;

        const paragraphType = newState.schema.nodes['paragraph'];
        if (!paragraphType) return null;

        const toFix: Array<{ from: number; to: number; replacements: PMNode[] }> = [];

        newState.doc.descendants((node, pos) => {
            if (node.type !== paragraphType) return true; // 段落以外は子孫へ継続
            const replacements = splitMixedParagraph(node);
            if (replacements) {
                toFix.push({ from: pos, to: pos + node.nodeSize, replacements });
            }
            return false; // 段落の子孫には降りない
        });

        if (toFix.length === 0) return null;

        const tr = newState.tr;
        // 後ろから処理してポジションのずれを防ぐ
        for (const { from, to, replacements } of [...toFix].reverse()) {
            tr.replaceWith(from, to, Fragment.fromArray(replacements));
        }
        return tr;
    }
}));
