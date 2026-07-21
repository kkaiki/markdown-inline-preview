/**
 * hardbreak（Enter で作られた同一段落内のソフト改行）の直後でも、見出し・引用・箇条書き・
 * 番号付きリスト・チェックボックスなどの Markdown 自動変換（Milkdown 組み込みの
 * `customInputRules`、および `@milkdown/plugin-clipboard` の貼り付け）が発火するように
 * する補完プラグイン。
 *
 * ### なぜ必要か
 * Milkdown の `customInputRules`（`@milkdown/prose` の `run()`）は、マッチ対象の
 * `textBefore` を常に `$from.parent.textBetween(...)`（＝テキストブロック全体の内容）
 * から計算する。`previewKeymapPlugin.ts` の `handleParagraphEnter` が段落を分割せず
 * hardbreak を挿入するようになったため、「Enter した直後の行」はもうテキストブロックの
 * 先頭ではなくなり、`^` アンカー付きの正規表現（見出し `^#{1,6}\s$` 等）が
 * 「Start\n## heading」のような直前のテキストを含んだ文字列に対してマッチしなくなった。
 * これにより、Enter → Markdown記法タイプという最も日常的な操作で見出し・引用・箇条書き・
 * チェックボックス・番号付きリストへの変換が起きなくなっていた。
 *
 * ### 方針
 * 1. まず既定どおり（テキストブロック全体基準）でどれかの input rule がマッチするなら
 *    何もしない（`false` を返す）。hardbreak を挟まない既存の全ケースは無変更。
 * 2. 既定ではマッチしないが、直前の hardbreak 以降（＝実質的な「行」）だけを基準にすると
 *    マッチする場合、その hardbreak を取り除いて本物の段落分割にしてから
 *    （`splitAtPrecedingHardbreak`）、同じ input rule の `handler` をそのまま呼ぶ。
 *    ヒューリスティックな変換ロジックの再実装はせず、Milkdown 組み込みルールの
 *    `handler` を「本物のブロック境界」の上で実行させることで、既存の変換仕様
 *    （リストのマージ規則、見出しレベル判定、チェック状態判定など）をそのまま再利用する。
 * 3. 分割 + handler 適用のどちらかが不成立なら、分割前の状態には触れない
 *    （`state.apply` で仮の次状態を作って handler を試し、成功したときだけ実際に dispatch する）。
 */
import { Plugin, PluginKey } from '@milkdown/prose/state';
import type { EditorState, Transaction } from '@milkdown/prose/state';
import { DOMParser, DOMSerializer } from '@milkdown/prose/model';
import type { Node as ProseNode } from '@milkdown/prose/model';
import { isTextOnlySlice } from '@milkdown/prose';
import { $prose } from '@milkdown/utils';
import { inputRulesCtx, parserCtx, schemaCtx } from '@milkdown/kit/core';

import { virtualLineStart, splitAtPrecedingHardbreak } from './hardbreakLine';

/** prosemirror-inputrules 本体と同じ、遡ってマッチを試みる最大文字数。 */
const MAX_MATCH = 500;

/**
 * `@milkdown/prose/inputrules`（`prosemirror-inputrules`）の `InputRule` は
 * tsconfig（`moduleResolution`）によって型解決される宣言ファイルが変わり得るため、
 * ここでは実際に使うプロパティ（`match`/`handler`）だけを持つ最小限の型を自前で
 * 定義する（`ctx.get(inputRulesCtx)` の実体はこれらを持つ実 `InputRule` インスタンス）。
 */
interface MinimalInputRule {
    match: RegExp;
    handler: (state: EditorState, match: RegExpExecArray, start: number, end: number) => Transaction | null;
}

function matchRules(rules: readonly MinimalInputRule[], textBefore: string, textLength: number): { rule: MinimalInputRule; match: RegExpExecArray } | null {
    for (const rule of rules) {
        const match = rule.match.exec(textBefore);
        if (!match || match[0].length < textLength) continue;
        return { rule, match };
    }
    return null;
}

/** ブロック構造（見出し/リスト/引用/表など）を持つかどうか。単一段落のみなら「実質テキスト」。 */
function isBlockShaped(doc: ProseNode): boolean {
    return doc.childCount !== 1 || doc.firstChild?.type.name !== 'paragraph';
}

export function createHardbreakLineInputRulesPlugin() {
    return $prose((ctx) => new Plugin({
        key: new PluginKey('hardbreakLineInputRules'),
        props: {
            handleTextInput(view, from, to, text) {
                if (view.composing || from !== to) return false;
                const state = view.state;
                const $from = state.doc.resolve(from);
                if (!$from.parent.isTextblock || $from.parent.type.spec.code) return false;

                const parentStart = $from.start();
                const lineStart = virtualLineStart($from);
                if (lineStart === parentStart) return false; // hardbreak を挟んでいない → 既定に委ねる

                const rules = ctx.get(inputRulesCtx) as unknown as MinimalInputRule[];

                // 既定（テキストブロック全体基準）で既にマッチするなら、既定の input rule に任せる。
                const vanillaTextBefore = $from.parent.textBetween(
                    Math.max(0, $from.parentOffset - MAX_MATCH), $from.parentOffset, undefined, '￼'
                ) + text;
                if (matchRules(rules, vanillaTextBefore, text.length)) return false;

                // 直前の hardbreak 以降だけを基準に再判定する。
                const lineTextBefore = state.doc.textBetween(Math.max(lineStart, from - MAX_MATCH), from, undefined, '￼') + text;
                for (const rule of rules) {
                    const match = rule.match.exec(lineTextBefore);
                    if (!match || match[0].length < text.length) continue;
                    const startPosInLine = from - (match[0].length - text.length);
                    if (startPosInLine < lineStart) continue; // 行境界をまたぐマッチは対象外

                    const hardbreakPos = lineStart - 1;
                    // hardbreak の前後で2回 split したあと、hardbreak 自体を削除して真に空の
                    // 段落（空行プレースホルダ）にする（`splitAtPrecedingHardbreak` と同じ理由。
                    // 詳細はそちらのコメント参照）。
                    let splitTr = state.tr.split(hardbreakPos + 1).split(hardbreakPos);
                    const placeholderHardbreakPos = hardbreakPos + 2;
                    splitTr = splitTr.delete(placeholderHardbreakPos, placeholderHardbreakPos + 1);
                    const mappedPos = splitTr.mapping.map(from);
                    const splitState = state.apply(splitTr);
                    const startPos2 = mappedPos - (match[0].length - text.length);
                    const tr2 = rule.handler(splitState, match, startPos2, mappedPos);
                    if (!tr2) continue; // このルールでは変換不成立 → 分割前の状態のまま次のルールを試す

                    view.dispatch(splitTr.scrollIntoView());
                    view.dispatch(tr2.scrollIntoView());
                    return true;
                }
                return false;
            },

            /**
             * hardbreak 継続行（Enter 直後、まだ本物のブロック境界になっていない行）へ
             * ブロック構造を持つ Markdown（チェックボックス・見出し・リスト等）を貼り付けた
             * 場合も、`handleTextInput` と同じ理由で `@milkdown/plugin-clipboard` の既定
             * `handlePaste`（`view.state.tr.replaceSelection(slice)`）がブロックの
             * ラッパーを剥がしてインラインテキストとして流し込んでしまう。ここで先に
             * hardbreak を本物の段落分割にしてから、既定のペースト処理と同じ
             * パース手順（markdown→slice→DOM→再パース）を実行する。
             * `milkdownApp.ts` で `.use(clipboard)` より前に登録し、先勝ちで本処理を優先する。
             */
            handlePaste(view, event) {
                const { clipboardData } = event;
                if (!clipboardData) return false;
                const { $from, empty } = view.state.selection;
                if (!empty || !$from.parent.isTextblock || $from.parent.type.spec.code) return false;

                const parentStart = $from.start();
                const lineStart = virtualLineStart($from);
                if (lineStart === parentStart) return false; // hardbreak を挟んでいない → 既定に委ねる

                // HTML 貼り付けは既定に委ねる（既定側も preProcessedSlice 経由で複雑な変換をするため）。
                if (clipboardData.getData('text/html').length > 0) return false;
                const text = clipboardData.getData('text/plain');
                if (text.length === 0) return false;

                const parser = ctx.get(parserCtx);
                const parsed = parser(text);
                if (!parsed || typeof parsed === 'string') return false;
                if (!isBlockShaped(parsed)) return false; // 単一段落（実質テキスト）は既定のペーストで十分

                splitAtPrecedingHardbreak(view, $from.pos);

                const schema = ctx.get(schemaCtx);
                const dom = DOMSerializer.fromSchema(schema).serializeFragment(parsed.content);
                const slice = DOMParser.fromSchema(schema).parseSlice(dom);
                const node = isTextOnlySlice(slice);
                const tr = node
                    ? view.state.tr.replaceSelectionWith(node, true)
                    : view.state.tr.replaceSelection(slice);
                view.dispatch(tr.scrollIntoView());
                return true;
            }
        }
    }));
}
