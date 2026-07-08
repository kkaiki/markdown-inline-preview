/**
 * コピー時、クリップボードの text/plain に markdown 保存用の `<br>` を漏らさない。
 *
 * `overrideHardbreakSerializer`（`hardbreakSerializer.ts`）は、GFM テーブルのセルが
 * リテラル改行を持てないため、セル内 hardbreak を保存用 markdown として `<br>` に変換する。
 * `@milkdown/plugin-clipboard` の既定 `clipboardTextSerializer` はコピー時にも同じ
 * markdown シリアライザをそのまま使うため、表セルの改行を含む範囲をコピーして他アプリへ
 * 貼り付けると、読める改行ではなく文字列 `<br>` がそのまま入ってしまう。
 *
 * `@milkdown/plugin-clipboard` と同じロジックで markdown 文字列を組み立てたうえで、
 * 保存用にのみ必要な `<br>` を実際の改行へ戻してからクリップボードへ渡す。
 * `.use(clipboard)` より前に登録する（ProseMirror の `someProp` は最初に見つかった
 * plugin の prop を採用するため、先勝ちでこちらが優先される）。
 */
import { schemaCtx, serializerCtx } from '@milkdown/kit/core';
import type { Node as ProseNode } from '@milkdown/prose/model';
import { Plugin, PluginKey } from '@milkdown/prose/state';
import type { Slice } from '@milkdown/prose/model';
import { $prose } from '@milkdown/utils';

const INLINE_BR_RE = /<br\s*\/?>/gi;

/** `@milkdown/plugin-clipboard` の isPureText と同じ判定（単一のプレーンテキストノードのみ true）。 */
function isPureText(content: unknown): boolean {
    if (!content) return false;
    if (Array.isArray(content)) {
        if (content.length > 1) return false;
        return isPureText(content[0]);
    }
    const child = (content as { content?: unknown }).content;
    if (child) return isPureText(child);
    return (content as { type?: string }).type === 'text';
}

export function createClipboardPlainTextPlugin() {
    return $prose((ctx) => new Plugin({
        key: new PluginKey('clipboardPlainText'),
        props: {
            clipboardTextSerializer: (slice: Slice) => {
                if (isPureText(slice.content.toJSON())) {
                    return slice.content.textBetween(0, slice.content.size, '\n\n');
                }
                const schema = ctx.get(schemaCtx);
                const doc: ProseNode | null = schema.topNodeType.createAndFill(undefined, slice.content);
                if (!doc) return '';
                const serializer = ctx.get(serializerCtx);
                return serializer(doc).replace(INLINE_BR_RE, '\n');
            }
        }
    }));
}
