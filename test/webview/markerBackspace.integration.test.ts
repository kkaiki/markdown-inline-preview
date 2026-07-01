/**
 * 行頭マーカーの段階的削除（markerBackspace）統合テスト。
 *
 * 「`##` 等を一度に全部消すのではなく、Raw のように 1 段階ずつ外したい」要望の回帰防止。
 * - 見出し: H2 → H1 → 段落
 * - チェックボックス: `- [ ]` → 箇条書き → 段落
 * - 箇条書き: → 段落
 */
import './jsdomSetup';
import * as assert from 'assert';
import { Editor, rootCtx, defaultValueCtx, editorViewCtx } from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { TextSelection } from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';

import { createMarkerBackspacePlugin } from '../../src/preview/webview/markerBackspace';

async function mkEditor(md: string): Promise<{ view: EditorView; destroy: () => void }> {
    const root = document.getElementById('root');
    if (!root) throw new Error('no root');
    root.innerHTML = '';
    const editor = await Editor.make()
        .config((ctx) => {
            ctx.set(rootCtx, root);
            ctx.set(defaultValueCtx, md);
        })
        .use(createMarkerBackspacePlugin())
        .use(commonmark)
        .use(gfm)
        .create();
    let view!: EditorView;
    editor.action((ctx) => { view = ctx.get(editorViewCtx); });
    return { view, destroy: () => void editor.destroy() };
}

/** 指定テキストの「先頭位置」にカーソルを置く。 */
function cursorAtTextStart(view: EditorView, text: string): void {
    let pos = -1;
    view.state.doc.descendants((node, p) => {
        if (pos < 0 && node.isText && node.text === text) { pos = p; return false; }
        return true;
    });
    if (pos < 0) throw new Error(`text not found: ${text}`);
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));
}

function pressBackspace(view: EditorView): void {
    const event = new window.KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true });
    view.dom.dispatchEvent(event);
}

function firstNode(view: EditorView): { name: string; level?: number; checked?: unknown } {
    const node = view.state.doc.firstChild;
    if (!node) return { name: '(empty)' };
    if (node.type.name === 'heading') return { name: 'heading', level: node.attrs.level as number };
    return { name: node.type.name };
}

/** 最初の list_item の checked 属性。 */
function firstListItemChecked(view: EditorView): unknown {
    let checked: unknown = 'NONE';
    view.state.doc.descendants((node) => {
        if (checked === 'NONE' && node.type.name === 'list_item') { checked = node.attrs.checked; return false; }
        return true;
    });
    return checked;
}

function topTypes(view: EditorView): string[] {
    const t: string[] = [];
    view.state.doc.forEach((n) => t.push(n.type.name));
    return t;
}

/** 現在のカーソル（$from）が属するテキストブロックの文字列。 */
function selectionParentText(view: EditorView): string {
    return view.state.selection.$from.parent.textContent;
}

describe('webview統合: 行頭マーカーの段階的削除（markerBackspace）', () => {
    let h: { view: EditorView; destroy: () => void };
    afterEach(() => h?.destroy());

    it('見出し H2 → Backspace で H1（1 段階だけ）', async () => {
        h = await mkEditor('## Title here\n');
        cursorAtTextStart(h.view, 'Title here');
        pressBackspace(h.view);
        assert.deepStrictEqual(firstNode(h.view), { name: 'heading', level: 1 }, 'H1 になっていない');
        assert.ok(h.view.state.doc.textContent.includes('Title here'), '中身が消えた');
    });

    it('見出し H1 → Backspace で段落（# は残さない、中身は残す）', async () => {
        h = await mkEditor('# Heading\n');
        cursorAtTextStart(h.view, 'Heading');
        pressBackspace(h.view);
        assert.strictEqual(firstNode(h.view).name, 'paragraph', '段落になっていない');
        assert.ok(!h.view.state.doc.textContent.startsWith('#'), '# が残っている');
        assert.ok(h.view.state.doc.textContent.includes('Heading'));
    });

    it('H2 を 2 回 Backspace で「H1 → 段落」と段階的に降格', async () => {
        h = await mkEditor('## Two steps\n');
        cursorAtTextStart(h.view, 'Two steps');
        pressBackspace(h.view); // H2 → H1
        assert.deepStrictEqual(firstNode(h.view), { name: 'heading', level: 1 });
        // 行頭にカーソルが残っているのでもう一度
        cursorAtTextStart(h.view, 'Two steps');
        pressBackspace(h.view); // H1 → 段落
        assert.strictEqual(firstNode(h.view).name, 'paragraph');
    });

    it('行頭以外（見出しの途中）では降格しない', async () => {
        h = await mkEditor('## Title\n');
        // "Title" の 2 文字目にカーソル
        let pos = -1;
        h.view.state.doc.descendants((node, p) => {
            if (pos < 0 && node.isText && node.text === 'Title') { pos = p + 2; return false; }
            return true;
        });
        h.view.dispatch(h.view.state.tr.setSelection(TextSelection.create(h.view.state.doc, pos)));
        pressBackspace(h.view);
        assert.deepStrictEqual(firstNode(h.view), { name: 'heading', level: 2 }, '途中の Backspace で降格してはいけない');
    });

    it('チェックボックス → Backspace で箇条書き（checked が外れる）', async () => {
        h = await mkEditor('- [ ] task\n');
        assert.ok(firstListItemChecked(h.view) === false, '前提: チェックボックス');
        cursorAtTextStart(h.view, 'task');
        pressBackspace(h.view);
        assert.strictEqual(firstListItemChecked(h.view), null, 'checked が外れて箇条書きになっていない');
        assert.ok(topTypes(h.view).includes('bullet_list'), 'まだリストのはず');
    });

    it('箇条書き → Backspace で段落（リストから外れる）', async () => {
        h = await mkEditor('- item\n');
        cursorAtTextStart(h.view, 'item');
        pressBackspace(h.view);
        assert.ok(!topTypes(h.view).includes('bullet_list'), 'リストから外れていない');
        assert.ok(h.view.state.doc.textContent.includes('item'));
    });

    it('チェックボックスは 2 回で「箇条書き → 段落」と段階的に外れる', async () => {
        h = await mkEditor('- [x] done\n');
        cursorAtTextStart(h.view, 'done');
        pressBackspace(h.view); // → 箇条書き
        assert.strictEqual(firstListItemChecked(h.view), null);
        cursorAtTextStart(h.view, 'done');
        pressBackspace(h.view); // → 段落
        assert.ok(!topTypes(h.view).includes('bullet_list'), '段落になっていない');
    });

    // ── カーソル位置の契約（前に行があるチェックボックスでも上の行へ飛ばない）──────────
    //
    // 【重要・テスト設計上の限界】
    // 実際に報告された不具合は「前に行があるチェックボックスの行頭で Backspace すると、
    // カーソルが上の行へ飛ぶ」というもの。だが真因は list-item-block コンポーネント
    // （実ブラウザの Web Component）がラベルを *非同期再描画* する際に DOM キャレットを
    // 奪い、ProseMirror がその DOM 選択を逆同期することにある。
    // jsdom にはレイアウトも当該コンポーネントも無いため、この不具合は **jsdom では再現しない**。
    // → 以下はあくまで「変換後もカーソルがそのリスト項目内に残る」というモデル契約の固定で
    //   あり、実描画レイヤの回帰は実ブラウザテスト（test/browser）でしか守れない点に注意。
    it('前に段落があってもカーソルはチェックボックスの行に残る（モデル契約）', async () => {
        h = await mkEditor('intro paragraph\n\n- [ ] task line\n');
        cursorAtTextStart(h.view, 'task line');
        pressBackspace(h.view);
        // 上の段落へ飛んでいないこと（カーソルは依然リスト項目のテキスト内）。
        assert.ok(
            selectionParentText(h.view).includes('task line'),
            `カーソルが上の行へ飛んだ: "${selectionParentText(h.view)}"`
        );
        assert.ok(topTypes(h.view).includes('bullet_list'), 'リストが消えた');
    });

    it('リスト2番目のチェックボックスでもカーソルはその行に残る（モデル契約）', async () => {
        h = await mkEditor('- [ ] first\n- [ ] second\n');
        cursorAtTextStart(h.view, 'second');
        pressBackspace(h.view);
        assert.ok(
            selectionParentText(h.view).includes('second'),
            `カーソルが別項目へ飛んだ: "${selectionParentText(h.view)}"`
        );
    });
});
