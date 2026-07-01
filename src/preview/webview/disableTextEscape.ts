/**
 * Markdown 文字列化時のテキストエスケープを全面的に無効化する。
 *
 * Milkdown 下層の remark（mdast-util-to-markdown）は、`text` ノードを書き出す際に
 * `state.safe()` を通し、unsafe パターン（`node_modules/mdast-util-to-markdown/lib/unsafe.js`）
 * に載った文字を機械的にバックスラッシュでエスケープする。たとえば段落中の `[` は
 * リンク参照に誤解釈されないよう常に `\[` になる（先読み判定はせず一律エスケープ）。
 *
 * Preview で編集した内容を Raw に戻すと、この `\[` `\*` `\#` などが素のソースに残り
 * 見た目が壊れる。ここでは `text` ハンドラを「ノード値をそのまま返す」よう差し替え、
 * すべてのエスケープを源流で止める。
 *
 * 注意: エスケープはあくまで round-trip 安全策なので、無効化すると「素のテキストに
 * 含まれる `|` がテーブルを壊す」「`[x](y)` 形のプレーン文字列が再読込でリンクになる」
 * といった構文衝突は防げなくなる。これはユーザー自身が編集する .md であることを前提に
 * 受け入れるトレードオフ。
 */
import type { Ctx } from '@milkdown/ctx';
import { remarkStringifyOptionsCtx } from '@milkdown/kit/core';

export function disableTextEscape(ctx: Ctx): void {
    ctx.update(remarkStringifyOptionsCtx, (prev) => ({
        ...prev,
        handlers: {
            ...prev?.handlers,
            // 既定の text ハンドラは state.safe() でエスケープする。値を無加工で返す。
            text: (node: { value: string }) => node.value
        }
    }));
}
