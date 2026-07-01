/**
 * 画像分離プラグイン（imageIsolationPlugin）の統合テスト。
 *
 * 「テキストと画像を同一段落に混在させない」要件の回帰防止。
 * appendTransaction でテキスト+画像が混在する段落を検知し、
 * 「テキストのみ」「画像のみ」の連続グループへ自動分割することを検証する。
 *
 * 注意: appendTransaction は「トランザクション」発生時のみ走り、初期ロード
 * （defaultValueCtx）では走らない。したがって各テストは画像挿入などの
 * トランザクションを dispatch して分離をトリガーする。
 */
import './jsdomSetup';
import * as assert from 'assert';
import { Editor, rootCtx, defaultValueCtx, editorViewCtx } from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { TextSelection } from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';
import type { Node as PMNode } from '@milkdown/prose/model';

import { imageIsolationPlugin } from '../../src/preview/webview/imageIsolationPlugin';

async function mkEditor(md: string): Promise<{ view: EditorView; destroy: () => void }> {
    const root = document.getElementById('root');
    if (!root) throw new Error('no root');
    root.innerHTML = '';
    const editor = await Editor.make()
        .config((ctx) => {
            ctx.set(rootCtx, root);
            ctx.set(defaultValueCtx, md);
        })
        .use(commonmark)
        .use(gfm)
        .use(imageIsolationPlugin)
        .create();
    let view!: EditorView;
    editor.action((ctx) => { view = ctx.get(editorViewCtx); });
    return { view, destroy: () => void editor.destroy() };
}

/** doc 直下のブロック種別名の配列。 */
function topTypes(view: EditorView): string[] {
    const t: string[] = [];
    view.state.doc.forEach((n) => t.push(n.type.name));
    return t;
}

/** 各段落について、子ノードの種別名配列を返す（段落ごとの中身を確認する）。 */
function paragraphChildKinds(view: EditorView): string[][] {
    const result: string[][] = [];
    view.state.doc.forEach((node) => {
        if (node.type.name !== 'paragraph') return;
        const kinds: string[] = [];
        node.forEach((c) => kinds.push(c.type.name));
        result.push(kinds);
    });
    return result;
}

/** 画像ノードの src 属性を生成して image ノードを作る。 */
function makeImage(view: EditorView, src: string): PMNode {
    const imageType = view.state.schema.nodes['image'];
    if (!imageType) throw new Error('image node type not found in schema');
    return imageType.create({ src });
}

describe('webview統合: 画像分離プラグイン（imageIsolation）', () => {
    let h: { view: EditorView; destroy: () => void };
    afterEach(() => h?.destroy());

    it('テキスト段落の途中に画像を挿入 → テキストと画像が別段落へ分離される', async () => {
        h = await mkEditor('hello world\n');
        // "hello" の後ろ（"hello| world"）に画像を挿入する
        let textPos = -1;
        h.view.state.doc.descendants((node, p) => {
            if (textPos < 0 && node.isText && node.text === 'hello world') { textPos = p + 5; return false; }
            return true;
        });
        assert.ok(textPos > 0, 'テキスト位置が見つからない');
        const img = makeImage(h.view, './a.png');
        h.view.dispatch(h.view.state.tr.insert(textPos, img));

        // appendTransaction によって段落が分割されているはず
        const kinds = paragraphChildKinds(h.view);
        // 画像だけの段落が独立して存在し、テキストと混在していないこと
        const mixed = kinds.find(k => k.includes('image') && k.some(x => x !== 'image'));
        assert.strictEqual(mixed, undefined, `テキストと画像が混在した段落が残っている: ${JSON.stringify(kinds)}`);
        const imageOnly = kinds.filter(k => k.length > 0 && k.every(x => x === 'image'));
        assert.ok(imageOnly.length >= 1, `画像のみの段落が無い: ${JSON.stringify(kinds)}`);
    });

    it('テキスト末尾に画像を挿入 → 画像専用の新段落になる', async () => {
        h = await mkEditor('caption\n');
        let endPos = -1;
        h.view.state.doc.descendants((node, p) => {
            if (node.isText && node.text === 'caption') endPos = p + node.nodeSize;
        });
        const img = makeImage(h.view, './b.png');
        h.view.dispatch(h.view.state.tr.insert(endPos, img));

        const kinds = paragraphChildKinds(h.view);
        const mixed = kinds.find(k => k.includes('image') && k.some(x => x !== 'image'));
        assert.strictEqual(mixed, undefined, `混在段落が残っている: ${JSON.stringify(kinds)}`);
    });

    it('画像のみの段落に2枚目を追加 → 同じ段落に並ぶ（分離しない）', async () => {
        // まず画像のみ段落を作る（空段落へ画像を入れる）
        h = await mkEditor('\n');
        const firstParaContentStart = 1; // doc>paragraph の中身先頭
        h.view.dispatch(h.view.state.tr.insert(firstParaContentStart, makeImage(h.view, './1.png')));
        // 2枚目を画像の隣に追加
        let imgEnd = -1;
        h.view.state.doc.descendants((node, p) => {
            if (node.type.name === 'image') imgEnd = p + node.nodeSize;
        });
        h.view.dispatch(h.view.state.tr.insert(imgEnd, makeImage(h.view, './2.png')));

        const kinds = paragraphChildKinds(h.view);
        const imageOnlyMulti = kinds.find(k => k.length >= 2 && k.every(x => x === 'image'));
        assert.ok(imageOnlyMulti, `画像2枚が同一段落に並んでいない: ${JSON.stringify(kinds)}`);
    });

    it('テキストのみ・画像のみが既に分離済みなら変更しない（無限ループ防止）', async () => {
        h = await mkEditor('plain paragraph\n');
        const before = JSON.stringify(h.view.state.doc.toJSON());
        // 文書を変えない無関係なトランザクション（選択だけ動かす）
        h.view.dispatch(h.view.state.tr.setSelection(
            TextSelection.create(h.view.state.doc, 1)
        ));
        assert.strictEqual(JSON.stringify(h.view.state.doc.toJSON()), before, 'テキストのみ段落を不必要に変更した');
    });

    it('分離後はトップレベルが段落の連続になる（リストやテーブルを壊さない）', async () => {
        h = await mkEditor('alpha beta\n');
        let pos = -1;
        h.view.state.doc.descendants((node, p) => {
            if (pos < 0 && node.isText && node.text === 'alpha beta') { pos = p + 5; return false; }
            return true;
        });
        h.view.dispatch(h.view.state.tr.insert(pos, makeImage(h.view, './c.png')));
        // すべてのトップレベルが paragraph であること（壊れた構造になっていない）
        assert.ok(topTypes(h.view).every(t => t === 'paragraph'), `想定外のトップレベル: ${topTypes(h.view).join(', ')}`);
    });
});
