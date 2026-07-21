/**
 * コードブロックのシンタックスハイライト（ProseMirror デコレーション方式）。
 *
 * 以前は hljs.highlightElement で `<pre><code>` の DOM を直接書き換えていたが、
 * ProseMirror（Milkdown）が管理する編集可能 DOM を外から書き換えると、ProseMirror の
 * MutationObserver が「自分が作っていない変更」とみなして即座に元へ戻すため、色が
 * 付かない（一瞬付いて消える）。そこで **inline decoration** として色を載せる。
 * デコレーションは ProseMirror 自身が描画・位置追従するので消えず、編集中の
 * ブロックでもカーソルが飛ばない。
 *
 * 仕組み: 各 code_block を hljs でハイライト → 出力 HTML を解析して、各テキスト断片に
 * 祖先 span の `hljs-*` クラスを付けた `Decoration.inline` を生成する。
 */
import { Plugin, PluginKey } from '@milkdown/prose/state';
import { Decoration, DecorationSet } from '@milkdown/prose/view';
import type { Node as ProseNode } from '@milkdown/prose/model';
import { $prose } from '@milkdown/utils';
import hljs from 'highlight.js/lib/common';
import { parseCodeFenceRealText } from '../../shared/markdown/focusSyntaxHelpers';
import { getExpandedCodeFence } from './codeFenceEditPlugin';

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

/** 1 つの code_block 分のデコレーションを decorations へ push する。 */
function decorateCodeBlock(node: ProseNode, nodePos: number, codeStart: number, decorations: Decoration[]): void {
    const language = typeof node.attrs.language === 'string' ? node.attrs.language : '';

    // codeFenceEditPlugin がこのブロックを展開中（フェンスが実テキストとして
    // 混ざっている）場合、開き・閉じの両方が完全な形で揃っているかを都度判定する。
    // どちらか一方でも崩れていれば、まだ code_block ノードのまま（変換は
    // フォーカスを外したときにしか起きない）でも「もうコードブロックとして
    // 保存されない」ことが分かるよう、`code-fence-broken` クラスを付けて
    // `.milkdown pre` の背景を動的に解除する（ユーザー要望）。
    if (getExpandedCodeFence()?.nodePos === nodePos && !parseCodeFenceRealText(node.textContent)) {
        decorations.push(Decoration.node(nodePos, nodePos + node.nodeSize, { class: 'code-fence-broken' }));
    }

    // mermaid は図として描画するのでシンタックス色は付けない。
    if (language === 'mermaid') return;

    let code = node.textContent;
    let offsetStart = codeStart;

    // codeFenceEditPlugin がこのブロックを展開中（フェンスが実テキストとして
    // 混ざっている）なら、マーカー部分を除いた実コードだけを hljs へ渡す。
    // そのままハイライトすると、マーカー行が不正な構文として色付けされてしまう。
    if (getExpandedCodeFence()?.nodePos === nodePos) {
        const parsed = parseCodeFenceRealText(code);
        if (parsed) {
            code = parsed.code;
            offsetStart = codeStart + parsed.openLen;
        }
    }

    if (!code) return;

    let html: string;
    try {
        html = language && hljs.getLanguage(language)
            ? hljs.highlight(code, { language, ignoreIllegals: true }).value
            : hljs.highlightAuto(code).value;
    } catch {
        return;
    }

    // hljs の出力 HTML を解析。各テキストノードに、その祖先 span の class をすべて付ける。
    const container = document.createElement('div');
    container.innerHTML = html;

    let offset = 0;
    const walk = (parent: Node, classes: readonly string[]): void => {
        for (const child of Array.from(parent.childNodes)) {
            if (child.nodeType === TEXT_NODE) {
                const len = child.textContent?.length ?? 0;
                if (len > 0 && classes.length > 0) {
                    decorations.push(
                        Decoration.inline(offsetStart + offset, offsetStart + offset + len, {
                            class: classes.join(' ')
                        })
                    );
                }
                offset += len;
            } else if (child.nodeType === ELEMENT_NODE) {
                const el = child as HTMLElement;
                walk(el, classes.concat(Array.from(el.classList)));
            }
        }
    };
    walk(container, []);
}

/** 文書全体のコードブロックからデコレーション集合を作る。 */
export function buildCodeDecorations(doc: ProseNode): DecorationSet {
    const decorations: Decoration[] = [];
    doc.descendants((node, pos) => {
        if (node.type.name === 'code_block') {
            // code_block の中身（テキスト）は pos+1 から始まる。
            decorateCodeBlock(node, pos, pos + 1, decorations);
            return false; // コードブロックの中はこれ以上潜らない
        }
        return true;
    });
    return DecorationSet.create(doc, decorations);
}

const codeHighlightKey = new PluginKey<DecorationSet>('codeHighlight');

export function createCodeHighlightPlugin() {
    return $prose(() => new Plugin<DecorationSet>({
        key: codeHighlightKey,
        state: {
            init: (_config, instance) => buildCodeDecorations(instance.doc),
            // 文書が変わったときだけ再計算（選択移動だけのときは作り直さない）。
            apply: (tr, old) => (tr.docChanged ? buildCodeDecorations(tr.doc) : old)
        },
        props: {
            decorations(state) {
                return codeHighlightKey.getState(state);
            }
        }
    }));
}
