/**
 * blockPrefixEditPlugin 統合テスト（Typora 風「フォーカスで記法展開」）。
 *
 * ### テスト設計上の前提
 * - エディタ作成直後、カーソルはドキュメント先頭ブロックに置かれる。
 *   第 1 ブロックが見出し / リスト項目なら plugin が即座に展開する（auto-expand）。
 * - そのため「初期状態 = null」ではなく「第 1 ブロックが段落の場合は null」で確認する。
 * - テキスト検索は展開後に `## Hello` となっているため、ノード位置で移動する。
 * - listItemBlockComponent は jsdom で SVGElement が無くてエラーになるため、
 *   基本の gfm プリセットだけでリスト項目をテストする。
 */
import '../jsdomSetup';
import * as assert from 'assert';
import { Editor, rootCtx, defaultValueCtx, editorViewCtx } from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { TextSelection } from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';

import { createBlockPrefixEditPlugin, getExpandedBlock } from '../../../src/preview/webview/blockPrefixEditPlugin';
import { createMarkerBackspacePlugin } from '../../../src/preview/webview/markerBackspace';

/** listItemBlockComponent なしの最小エディタ（jsdom で SVGElement が不要）。 */
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
        .use(createBlockPrefixEditPlugin())
        .use(commonmark)
        .use(gfm)
        .create();
    let view!: EditorView;
    editor.action((ctx) => { view = ctx.get(editorViewCtx); });
    return { view, destroy: () => void editor.destroy() };
}

// ──────────────────────────────────────────
// ノード位置ベースのカーソル移動ヘルパー
// ──────────────────────────────────────────

/** 最初の見出しノードの content start にカーソルを置く。 */
function cursorInFirstHeading(view: EditorView): void {
    let pos = -1;
    view.state.doc.forEach((node, offset) => {
        if (pos < 0 && node.type.name === 'heading') pos = offset + 1;
    });
    if (pos < 0) throw new Error('heading not found');
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));
}

/** N 番目（0-indexed）のトップレベルブロックの content start にカーソルを置く。 */
function cursorInBlock(view: EditorView, index: number): void {
    let i = 0;
    let pos = -1;
    view.state.doc.forEach((node, offset) => {
        if (i++ === index) pos = offset + 1;
    });
    if (pos < 0) throw new Error(`block[${index}] not found`);
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));
}

/** 最初の list_item の段落の content start にカーソルを置く。 */
function cursorInFirstListItem(view: EditorView): void {
    let pos = -1;
    view.state.doc.descendants((node, p) => {
        if (pos < 0 && node.type.name === 'list_item') { pos = p + 2; return false; }
        return true;
    });
    if (pos < 0) throw new Error('list_item not found');
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));
}

/** N 番目（0-indexed）の list_item の段落の content start にカーソルを置く。 */
function cursorInNthListItem(view: EditorView, index: number): void {
    let i = 0;
    let pos = -1;
    view.state.doc.descendants((node, p) => {
        if (pos >= 0) return false;
        if (node.type.name === 'list_item') {
            if (i === index) { pos = p + 2; return false; }
            i++;
        }
        return true;
    });
    if (pos < 0) throw new Error(`list_item[${index}] not found`);
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));
}

/** 最初の blockquote 内の段落の content start にカーソルを置く。 */
function cursorInFirstBlockquote(view: EditorView): void {
    let pos = -1;
    view.state.doc.descendants((node, p) => {
        if (pos < 0 && node.type.name === 'blockquote') { pos = p + 2; return false; }
        return true;
    });
    if (pos < 0) throw new Error('blockquote not found');
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));
}

/** ドキュメント末尾にカーソルを置く。 */
function cursorAtEnd(view: EditorView): void {
    view.dispatch(view.state.tr.setSelection(TextSelection.atEnd(view.state.doc)));
}

/** ドキュメント全テキストを返す。 */
function docText(view: EditorView): string {
    return view.state.doc.textContent;
}

/** N 番目（0-indexed）トップレベルノード情報。 */
function nodeInfo(view: EditorView, index: number): { name: string; level?: number } {
    const node = view.state.doc.maybeChild(index);
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

// ──────────────────────────────────────────────────────────────────────
// テスト
// ──────────────────────────────────────────────────────────────────────

describe('blockPrefixEditPlugin: フォーカスでプレフィックス展開', () => {
    let h: { view: EditorView; destroy: () => void };
    afterEach(() => { h?.destroy(); });

    // ──────────────────────────────────────────
    // 見出し
    // ──────────────────────────────────────────
    describe('見出し', () => {
        it('段落が最初のブロックのときは getExpandedBlock() は null', async () => {
            // 段落 → 見出し の順で、初期カーソルは段落に入る → 展開なし
            h = await mkEditor('Not a heading\n\n## Heading\n');
            assert.strictEqual(getExpandedBlock(), null, '段落では展開されない');
        });

        it('H2 にカーソルを移すと getExpandedBlock() が non-null になる', async () => {
            h = await mkEditor('Other paragraph\n\n## Hello\n');
            assert.strictEqual(getExpandedBlock(), null, '最初は null');
            cursorInBlock(h.view, 1); // 2番目ブロック = H2
            assert.ok(getExpandedBlock() !== null, 'H2 にフォーカスで展開');
        });

        it('H2 にフォーカスすると "## " がテキスト先頭に現れる', async () => {
            h = await mkEditor('Other paragraph\n\n## Hello\n');
            cursorInBlock(h.view, 1);
            // 見出しの textContent が "## Hello" になっているか確認
            const headingText = h.view.state.doc.child(1).textContent;
            assert.ok(headingText.startsWith('## '), `テキスト: ${headingText}`);
            assert.ok(headingText.includes('Hello'), `Hello が消えた: ${headingText}`);
        });

        it('別の段落に移ると getExpandedBlock() が null に戻る', async () => {
            h = await mkEditor('Other paragraph\n\n## Hello\n');
            cursorInBlock(h.view, 1); // H2 に入る
            assert.ok(getExpandedBlock() !== null);
            cursorInBlock(h.view, 0); // 段落に戻る
            assert.strictEqual(getExpandedBlock(), null, 'segment 後は null');
        });

        it('別の段落に移るとプレフィックスが削除される', async () => {
            h = await mkEditor('Other paragraph\n\n## Hello\n');
            cursorInBlock(h.view, 1); // 展開
            cursorInBlock(h.view, 0); // 折りたたみ

            const headingText = h.view.state.doc.child(1).textContent;
            assert.ok(!headingText.startsWith('## '), `prefix 残存: ${headingText}`);
            assert.strictEqual(headingText, 'Hello', `テキスト: ${headingText}`);
        });

        it('H2 に入った直後（auto-expand）でも展開状態になっている', async () => {
            // 第 1 ブロックが H2 のとき、作成直後に auto-expand が起きる
            h = await mkEditor('## Title\n\nParagraph\n');
            assert.ok(getExpandedBlock() !== null, 'auto-expand されていない');
            const headingText = h.view.state.doc.child(0).textContent;
            assert.ok(headingText.startsWith('## '), `テキスト: ${headingText}`);
        });

        it('プレフィックスを "### " に変えて抜けると H3 に昇格', async () => {
            h = await mkEditor('Other\n\n## Hello\n');
            cursorInBlock(h.view, 1); // H2 展開 → "## Hello"

            const expanded = getExpandedBlock();
            assert.ok(expanded !== null);
            // contentStart に '#' を挿入 → "## " が "### " になる
            h.view.dispatch(h.view.state.tr.insertText('#', expanded.contentStart));

            cursorInBlock(h.view, 0); // 抜けて折りたたみ

            // block[1] = 見出し（block[0] は段落 "Other"）
            assert.deepStrictEqual(nodeInfo(h.view, 1), { name: 'heading', level: 3 });
            assert.strictEqual(h.view.state.doc.child(1).textContent, 'Hello');
        });

        it('2 番目の "#" を削除して抜けると H1 に降格', async () => {
            h = await mkEditor('Other\n\n## Hello\n');
            cursorInBlock(h.view, 1); // H2 展開

            const expanded = getExpandedBlock();
            assert.ok(expanded !== null);
            const pos = expanded.contentStart + 1; // 2 番目の '#'
            h.view.dispatch(h.view.state.tr.delete(pos, pos + 1)); // "## " → "# "

            cursorInBlock(h.view, 0);

            assert.deepStrictEqual(nodeInfo(h.view, 1), { name: 'heading', level: 1 });
        });

        it('リンクで始まる見出しにフォーカスしても、挿入した "## " がリンクのマークを継承しない', async () => {
            h = await mkEditor('Other\n\n## [1. Heading](#1-heading)\n');
            cursorInBlock(h.view, 1);

            const heading = h.view.state.doc.child(1);
            const prefixNode = heading.firstChild;
            assert.strictEqual(
                prefixNode?.marks.length,
                0,
                `挿入したプレフィックスがマークを継承した: ${JSON.stringify(prefixNode?.marks.map((m) => m.type.name))}`
            );
        });
    });

    // ──────────────────────────────────────────
    // タスクリスト
    // ──────────────────────────────────────────
    // チェックボックス項目は blockPrefixEditPlugin によるプレフィックス展開を行わない。
    // 展開すると label-wrapper（視覚的チェックボックス）が非表示になり、クリックによる
    // トグルが動作しなくなるため。チェックボックスは クリック / Cmd+Enter でトグルする。
    describe('タスクリスト', () => {
        it('- [ ] item にカーソルを入れても展開しない（getExpandedBlock() = null）', async () => {
            h = await mkEditor('Other\n\n- [ ] task\n');
            cursorInFirstListItem(h.view);

            assert.strictEqual(getExpandedBlock(), null, 'チェックボックス項目は展開されない');
            // プレフィックスが挿入されておらず、テキストは元のまま
            const liText = h.view.state.doc.child(1).firstChild?.textContent ?? '';
            assert.strictEqual(liText, 'task', `プレフィックスが挿入されてしまった: ${liText}`);
        });

        it('- [x] item にカーソルを入れても展開しない', async () => {
            h = await mkEditor('Other\n\n- [x] done\n');
            cursorInFirstListItem(h.view);

            assert.strictEqual(getExpandedBlock(), null, 'チェックボックス項目は展開されない');
            const liText = h.view.state.doc.child(1).firstChild?.textContent ?? '';
            assert.strictEqual(liText, 'done', `プレフィックスが挿入されてしまった: ${liText}`);
        });

        it('チェックボックス項目を通過しても他ブロックの展開に影響しない', async () => {
            h = await mkEditor('Other\n\n- [ ] task\n\n## Heading\n');
            // チェックボックスへ移動しても展開なし
            cursorInFirstListItem(h.view);
            assert.strictEqual(getExpandedBlock(), null);
            // 次に見出しへ移動すると展開される
            cursorInBlock(h.view, 2); // 3 番目ブロック = H2
            assert.ok(getExpandedBlock() !== null, 'H2 は展開される');
        });

        it('checked 属性が保持される（展開なしでも属性は変わらない）', async () => {
            h = await mkEditor('Other\n\n- [ ] task\n');
            cursorInFirstListItem(h.view);
            cursorInBlock(h.view, 0);

            assert.strictEqual(firstListItemChecked(h.view), false, 'checked=false が保持される');
            const liText = h.view.state.doc.child(1).firstChild?.textContent ?? '';
            assert.strictEqual(liText, 'task', 'テキストが変化していない');
        });

        it('markerBackspace のチェックボックス→箇条書き降格直後に "- " が実テキストとして漏れない（実バグ回帰・2026-07-08 発見/修正）', async () => {
            // markerBackspace はチェックボックス項目の行頭 Backspace で checked を
            // boolean → null（箇条書き化）に変える setNodeMarkup を発行する。この瞬間、
            // カーソルはまだその項目内にあり、checked が boolean でなくなったことで
            // getFocusedBlockInfo が「フォーカス中の普通の箇条書き」と判定できる状態に
            // なる。setBlockPrefixExpansionSuppressed で囲んでいなければ、直後の
            // view.update() が誤って "- " をプレフィックス展開として実テキストに挿入し、
            // "- second" のように記法がテキストへ漏れ出してしまっていた。
            h = await mkEditor('- [x] first\n- [ ] second\n');
            cursorInNthListItem(h.view, 1); // "second" の先頭
            const event = new window.KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true });
            h.view.dom.dispatchEvent(event);

            const secondItem = h.view.state.doc.child(0).child(1); // bullet_list.list_item[1]
            const secondText = secondItem.firstChild?.textContent ?? '';
            assert.strictEqual(secondText, 'second',
                `降格後のテキストに "- " 等の記法が漏れてはいけない: ${JSON.stringify(secondText)}`);
            assert.strictEqual(secondItem.attrs.checked, null,
                '降格後は checked=null（普通の箇条書き）であるべき');
            assert.strictEqual(getExpandedBlock(), null,
                '降格直後にプレフィックス展開状態になってはいけない');
        });
    });

    // ──────────────────────────────────────────
    // 箇条書き
    // ──────────────────────────────────────────
    describe('箇条書き', () => {
        it('- item にカーソルを入れると "- " が先頭に現れる', async () => {
            h = await mkEditor('Other\n\n- item\n');
            cursorInFirstListItem(h.view);

            assert.ok(getExpandedBlock() !== null);
            const liText = h.view.state.doc.child(1).firstChild?.textContent ?? '';
            assert.ok(liText.startsWith('- '), `テキスト: ${liText}`);
        });

        it('抜けると "- " が消えてテキストだけ残る', async () => {
            h = await mkEditor('Other\n\n- item\n');
            cursorInFirstListItem(h.view);
            cursorInBlock(h.view, 0);

            const liText = h.view.state.doc.child(1).firstChild?.textContent ?? '';
            assert.strictEqual(liText, 'item', `テキスト: ${liText}`);
        });

        it('リンクで始まる箇条書きにフォーカスしても、挿入した "- " がリンクのマークを継承しない', async () => {
            // 不具合: 展開時に挿入する "- " は `insertText` の挙動により、挿入位置の直後にある
            // マーク付きテキスト（リンク等）のマークを継承してしまう。すると "- " がリンクの
            // 一部として扱われ、`[- 1. 見出し](#anchor)` のように "- " がリンクの [...] の
            // 中に入り込んで見える（本来は `- [1. 見出し](#anchor)` と、リンクの外にあるべき）。
            h = await mkEditor('Other\n\n- [1. Heading](#1-heading)\n');
            cursorInFirstListItem(h.view);

            // doc.child(1) = bullet_list → .firstChild = list_item → .firstChild = paragraph
            const listItem = h.view.state.doc.child(1).firstChild;
            const para = listItem?.firstChild;
            const prefixNode = para?.firstChild;
            assert.strictEqual(
                prefixNode?.marks.length,
                0,
                `挿入したプレフィックスがマークを継承した: ${JSON.stringify(prefixNode?.marks.map((m) => m.type.name))}`
            );
            assert.ok(prefixNode?.text?.startsWith('-'), `先頭がプレフィックスでない: ${prefixNode?.text}`);
        });
    });

    // ──────────────────────────────────────────
    // 番号付きリスト
    // ──────────────────────────────────────────
    describe('番号付きリスト', () => {
        it('1. item にカーソルを入れると "1. " が先頭に現れる', async () => {
            h = await mkEditor('Other\n\n1. item\n');
            cursorInFirstListItem(h.view);

            assert.ok(getExpandedBlock() !== null);
            const liText = h.view.state.doc.child(1).firstChild?.textContent ?? '';
            assert.ok(liText.startsWith('1. '), `テキスト: ${liText}`);
        });

        it('抜けると "1. " が消えてテキストだけ残る', async () => {
            h = await mkEditor('Other\n\n1. item\n');
            cursorInFirstListItem(h.view);
            cursorInBlock(h.view, 0);

            const liText = h.view.state.doc.child(1).firstChild?.textContent ?? '';
            assert.strictEqual(liText, 'item', `テキスト: ${liText}`);
        });

        it('2番目の項目にカーソルを入れると項目自身の番号 "2. " が現れる（常に "1. " にならない）', async () => {
            h = await mkEditor('Other\n\n1. first\n2. second\n');
            cursorInNthListItem(h.view, 1); // 0-indexed → 2番目

            assert.ok(getExpandedBlock() !== null);
            const orderedList = h.view.state.doc.child(1);
            const secondItemText = orderedList.child(1).firstChild?.textContent ?? '';
            assert.ok(secondItemText.startsWith('2. '), `テキスト: ${secondItemText}`);
        });

        it('抜けても番号は変化しない（"2. " のまま維持される）', async () => {
            h = await mkEditor('Other\n\n1. first\n2. second\n');
            cursorInNthListItem(h.view, 1);
            cursorInBlock(h.view, 0); // 折りたたみ

            const orderedList = h.view.state.doc.child(1);
            const secondItemText = orderedList.child(1).firstChild?.textContent ?? '';
            assert.strictEqual(secondItemText, 'second', `テキスト: ${secondItemText}`);
        });

        it('リンクで始まる番号付き項目にフォーカスしても、挿入した番号プレフィックスがリンクのマークを継承しない', async () => {
            h = await mkEditor('Other\n\n1. [1. Heading](#1-heading)\n');
            cursorInFirstListItem(h.view);

            const listItem = h.view.state.doc.child(1).firstChild;
            const para = listItem?.firstChild;
            const prefixNode = para?.firstChild;
            assert.strictEqual(
                prefixNode?.marks.length,
                0,
                `挿入したプレフィックスがマークを継承した: ${JSON.stringify(prefixNode?.marks.map((m) => m.type.name))}`
            );
            assert.ok(prefixNode?.text?.startsWith('1.'), `先頭がプレフィックスでない: ${prefixNode?.text}`);
        });
    });

    // ──────────────────────────────────────────
    // blockquote
    // ──────────────────────────────────────────
    describe('blockquote', () => {
        it('> text にカーソルを入れると "> " が先頭に現れる', async () => {
            h = await mkEditor('Other\n\n> quoted\n');
            cursorInFirstBlockquote(h.view); // blockquote の中の段落へ

            assert.ok(getExpandedBlock() !== null);
            // blockquote の最初の paragraph テキストが "> quoted" になっているか
            const bqNode = h.view.state.doc.child(1);
            const paraText = bqNode.firstChild?.textContent ?? '';
            assert.ok(paraText.startsWith('> '), `テキスト: ${paraText}`);
        });

        it('抜けると "> " が消える', async () => {
            h = await mkEditor('Other\n\n> quoted\n');
            cursorInFirstBlockquote(h.view);
            cursorInBlock(h.view, 0);

            assert.strictEqual(getExpandedBlock(), null);
            const bqNode = h.view.state.doc.child(1);
            const paraText = bqNode.firstChild?.textContent ?? '';
            assert.strictEqual(paraText, 'quoted', `テキスト: ${paraText}`);
        });

        it('リンクで始まる blockquote にフォーカスしても、挿入した "> " がリンクのマークを継承しない', async () => {
            h = await mkEditor('Other\n\n> [1. Heading](#1-heading)\n');
            cursorInFirstBlockquote(h.view);

            const bqNode = h.view.state.doc.child(1);
            const prefixNode = bqNode.firstChild?.firstChild;
            assert.strictEqual(
                prefixNode?.marks.length,
                0,
                `挿入したプレフィックスがマークを継承した: ${JSON.stringify(prefixNode?.marks.map((m) => m.type.name))}`
            );
        });
    });

    // ──────────────────────────────────────────
    // markerBackspace との共存
    // ──────────────────────────────────────────
    describe('markerBackspace との共存', () => {
        it('展開中は getExpandedBlock() が non-null を返すため markerBackspace は return false できる', async () => {
            // markerBackspace.handleKeyDown 内の `if (getExpandedBlock() !== null) return false;`
            // が機能するかを確認するため、展開状態で getExpandedBlock() の戻り値を直接検証する。
            // （`contentStart` での Backspace は ProseMirror 既定の joinBackward も発火するため
            //    統合レベルでの「降格しない」アサーションは不安定。ここでは前提条件の確認に留める。）
            h = await mkEditor('Other\n\n## Heading\n');
            cursorInBlock(h.view, 1); // H2 を展開
            assert.ok(getExpandedBlock() !== null, '展開後は expandedBlock が non-null');

            // プレフィックス先頭にカーソルを移しても展開状態が維持される
            const eb1 = getExpandedBlock();
            const contentStart1 = eb1 !== null ? eb1.contentStart : 0;
            h.view.dispatch(h.view.state.tr.setSelection(
                TextSelection.create(h.view.state.doc, contentStart1)
            ));
            // update() は「同じブロック」と判断してスキップするので null にならないはず
            assert.ok(getExpandedBlock() !== null,
                'contentStart にカーソルを移しても expandedBlock が消えてしまった');
        });

        it('展開中に tr.delete でプレフィックスの # を削除して抜けると level が更新される', async () => {
            // jsdom は ProseMirror の execCommand ベースの文字削除が動かないため
            // 直接 tr.delete でプレフィックスの '#' を消してから collapse を確認する。
            h = await mkEditor('Other\n\n## Heading\n');
            cursorInBlock(h.view, 1);

            const eb2 = getExpandedBlock();
            const contentStart2 = eb2 !== null ? eb2.contentStart : 0;
            // "## Heading" の 2 番目の '#'（contentStart+1）を削除 → "# Heading"
            const pos = contentStart2 + 1;
            h.view.dispatch(h.view.state.tr.delete(pos, pos + 1));

            const headingText = h.view.state.doc.child(1).textContent;
            assert.ok(headingText.startsWith('# '), `削除後テキスト: ${headingText}`);
            assert.ok(!headingText.startsWith('## '), `'##' のまま: ${headingText}`);

            // 抜けると collapse して level が 1 に更新される
            cursorInBlock(h.view, 0);
            assert.deepStrictEqual(nodeInfo(h.view, 1), { name: 'heading', level: 1 });
        });
    });

    // ──────────────────────────────────────────
    // 複数ブロック間の移動
    // ──────────────────────────────────────────
    describe('複数ブロック間の移動', () => {
        it('H2 → H3 と移動すると旧ブロックのプレフィックスが消え新ブロックが展開', async () => {
            h = await mkEditor('Other\n\n## H2 title\n\n### H3 title\n');
            cursorInBlock(h.view, 1); // H2 を展開
            cursorInBlock(h.view, 2); // H3 に移動

            assert.ok(getExpandedBlock() !== null);
            // H2 の textContent はプレフィックスなし
            const h2Text = h.view.state.doc.child(1).textContent;
            assert.strictEqual(h2Text, 'H2 title', `H2 prefix 残存: ${h2Text}`);
            // H3 の textContent はプレフィックスあり
            const h3Text = h.view.state.doc.child(2).textContent;
            assert.ok(h3Text.startsWith('### '), `H3 prefix なし: ${h3Text}`);
        });
    });
});
