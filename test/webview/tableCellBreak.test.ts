/**
 * テーブルセル内改行の round-trip テスト。
 * - overrideHardbreakSerializer: セル内 hardbreak → `<br>`（表の外は既定）。
 * - convertTableCellBreaksToEntities + Milkdown parse: `<br>` → hardbreak。
 */
import './jsdomSetup';
import * as assert from 'assert';
import { Editor, rootCtx, defaultValueCtx, editorViewCtx, serializerCtx, parserCtx } from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { TextSelection } from '@milkdown/prose/state';
import type { Node as ProseNode } from '@milkdown/prose/model';

import { overrideHardbreakSerializer } from '../../src/preview/webview/hardbreakSerializer';
import { createTableCellEnterPlugin } from '../../src/preview/webview/tableCellEnterPlugin';
import { convertTableCellBreaksToEntities } from '../../src/shared/markdown/lineBreaks';

async function mkEditor(md: string) {
    const root = document.getElementById('root');
    if (!root) throw new Error('no root');
    root.innerHTML = '';
    return Editor.make()
        .config((ctx) => {
            ctx.set(rootCtx, root);
            ctx.set(defaultValueCtx, md);
            overrideHardbreakSerializer(ctx);
        })
        // 実際の Enter 操作を再現するため tableCellEnterPlugin も載せる
        .use(createTableCellEnterPlugin())
        .use(commonmark)
        .use(gfm)
        .create();
}

function pressEnter(view: { dom: Element }): void {
    view.dom.dispatchEvent(new window.KeyboardEvent('keydown', {
        key: 'Enter', code: 'Enter', bubbles: true, cancelable: true
    }));
}

function hasHardbreak(doc: ProseNode): boolean {
    let found = false;
    doc.descendants((n) => { if (n.type.name === 'hardbreak') found = true; });
    return found;
}

describe('テーブルセル内改行 round-trip', () => {
    it('セル内 hardbreak は <br> としてシリアライズされる', async () => {
        const editor = await mkEditor('| a | b |\n| --- | --- |\n| x | y |\n');
        let serialized = '';
        editor.action((ctx) => {
            const view = ctx.get(editorViewCtx);
            const ser = ctx.get(serializerCtx);
            const hb = view.state.schema.nodes.hardbreak;
            let pos = -1;
            view.state.doc.descendants((n, p) => { if (pos < 0 && n.isText && n.text === 'x') pos = p + n.nodeSize; });
            let tr = view.state.tr.setSelection(TextSelection.create(view.state.tr.doc, pos));
            tr = tr.replaceSelectionWith(hb.create({ isInline: false }), false).insertText('z', tr.selection.to);
            view.updateState(view.state.apply(tr));
            serialized = ser(view.state.doc);
        });
        assert.ok(serialized.includes('x<br>z'), `<br> が出力されていない: ${serialized}`);
        // 行が壊れていない（テーブル行は 1 物理行のまま）
        assert.ok(!/\|\s*\n[^|]/.test(serialized.replace(/\| --- /g, '')), `行が分断されている: ${serialized}`);
    });

    it('段落の hardbreak は <br> にならない（既定のまま）', async () => {
        const editor = await mkEditor('para\n');
        let serialized = '';
        editor.action((ctx) => {
            const view = ctx.get(editorViewCtx);
            const ser = ctx.get(serializerCtx);
            const hb = view.state.schema.nodes.hardbreak;
            let pos = -1;
            view.state.doc.descendants((n, p) => { if (pos < 0 && n.isText && n.text === 'para') pos = p + n.nodeSize; });
            let tr = view.state.tr.setSelection(TextSelection.create(view.state.tr.doc, pos));
            tr = tr.replaceSelectionWith(hb.create({ isInline: false }), false).insertText('next', tr.selection.to);
            view.updateState(view.state.apply(tr));
            serialized = ser(view.state.doc);
        });
        assert.ok(!serialized.includes('<br>'), `段落で <br> が出てしまった: ${serialized}`);
    });

    it('<br> を含むセルは normalize 経由で hardbreak としてパースされる', async () => {
        const fileMd = '| a | b |\n| --- | --- |\n| x<br>z | y |\n';
        const normalized = convertTableCellBreaksToEntities(fileMd);
        const editor = await mkEditor(normalized);
        editor.action((ctx) => {
            const parser = ctx.get(parserCtx);
            const doc = parser(normalized);
            assert.ok(doc && hasHardbreak(doc), 'セル内 <br> が hardbreak にならなかった');
        });
    });

    it('セル内で Enter キーを押すと <br> 付きでシリアライズされる（実操作）', async () => {
        // セル内容 "xz" の x と z の間にカーソルを置いて Enter
        const editor = await mkEditor('| a | b |\n| --- | --- |\n| xz | y |\n');
        let serialized = '';
        editor.action((ctx) => {
            const view = ctx.get(editorViewCtx);
            let pos = -1;
            view.state.doc.descendants((n, p) => { if (pos < 0 && n.isText && n.text === 'xz') pos = p + 1; });
            view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.tr.doc, pos)));
            pressEnter(view);
            serialized = ctx.get(serializerCtx)(view.state.doc);
        });
        assert.ok(serialized.includes('x<br>z'), `Enter 後に <br> が入っていない: ${serialized}`);
    });

    it('round-trip が安定（<br> → hardbreak → <br>）', async () => {
        const fileMd = '| a | b |\n| --- | --- |\n| x<br>z | y |\n';
        const normalized = convertTableCellBreaksToEntities(fileMd);
        const editor = await mkEditor(normalized);
        let out = '';
        editor.action((ctx) => { out = ctx.get(serializerCtx)(ctx.get(editorViewCtx).state.doc); });
        assert.ok(out.includes('x<br>z'), `round-trip で <br> が保てていない: ${out}`);
    });
});
