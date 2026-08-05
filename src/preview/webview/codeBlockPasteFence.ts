/**
 * コードブロックの中へ「フェンス付きテキスト」を貼り付けたときに、外側のフェンスを
 * 剥がして中身だけを入れるプラグイン（二重フェンス防止）。
 *
 * ChatGPT 等からコピーしたコードは `` ``` `` フェンスごとクリップボードに入っている
 * ことが多い。コードブロックの内容は常にリテラルなので、そのまま貼ると `` ``` `` が
 * 本文として入り込む。保存時には remark が「内容を包める長さ」まで外側フェンスを広げる
 * （4連バッククォート）ため、ファイルが二重フェンスになり、
 *
 *   - Preview ではフェンス行が4本並んで見える（`code-fence-display-length-fix.md`）
 *   - コードブロック内で Cmd+A しても「中身」に `` ``` `` が含まれるためコピー結果に混ざる
 *
 * という状態になる（2026-07-27 ユーザー報告）。貼り付けの時点で防ぐ。
 *
 * 貼り付け先がコードブロックでない場合や、貼り付けたテキストが単一の完結したフェンス
 * ブロックでない場合は何もしない（＝既定の貼り付け動作）。
 */

import { Plugin, PluginKey } from '@milkdown/prose/state';
import { $prose } from '@milkdown/utils';
import { unwrapFencedBlock } from '../../shared/markdown/codeFence';

const codeBlockPasteFenceKey = new PluginKey('codeBlockPasteFence');

export function createCodeBlockPasteFencePlugin() {
    return $prose(() => new Plugin({
        key: codeBlockPasteFenceKey,
        props: {
            handlePaste: (view, event) => {
                const { $from } = view.state.selection;
                if ($from.parent.type.name !== 'code_block') return false;

                const text = event.clipboardData?.getData('text/plain') ?? '';
                if (!text) return false;
                const unwrapped = unwrapFencedBlock(text);
                if (!unwrapped) return false;

                let tr = view.state.tr.insertText(unwrapped.code);
                // 貼り付け元に言語があり、貼り付け先がまだ無指定なら引き継ぐ。
                const blockPos = $from.before();
                const block = view.state.doc.nodeAt(blockPos);
                const currentLanguage = typeof block?.attrs.language === 'string' ? block.attrs.language : '';
                if (block && unwrapped.language && currentLanguage === '') {
                    tr = tr.setNodeMarkup(blockPos, undefined, {
                        ...block.attrs,
                        language: unwrapped.language
                    });
                }
                view.dispatch(tr.scrollIntoView());
                return true;
            }
        }
    }));
}
