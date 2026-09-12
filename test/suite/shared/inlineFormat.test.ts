/**
 * Notion 準拠のインライン書式ショートカット（⌘B / ⌘I / ⌘U / ⌘E / ⌘⇧S / ⌘K / ⌘⇧M / ⌘⇧H）が
 * 選択テキストをどう書き換えるかを、エディタ非依存の純関数として固定する。
 *
 * ここは Raw（VS Code TextEditor）と Live（CodeMirror）の両方から呼ばれる唯一の実装なので、
 * 「同じキーを押したら両モードで同じ文字列になる」ことはこの層で担保する。
 * 実際にキーが届くか・カーソルが正しく残るかは上位レイヤー
 * （test/browser/live/shortcuts/・test/extension/raw/shortcuts.test.ts）の担当。
 *
 * 期待値の出典: Notion 公式ヘルプのキーボードショートカット
 * （docs/research/notion-shortcuts.md §1.1）。
 */
import * as assert from 'assert';
import { applyInlineFormat } from '../../../src/shared/inlineFormat';

describe('Notion 準拠のインライン書式', () => {
    describe('選択テキストを記法で囲む', () => {
        it('⌘B は選択を ** で囲み、囲んだ中身を選択したままにする', () => {
            assert.deepStrictEqual(applyInlineFormat('text', 'bold'), {
                insert: '**text**',
                selectionStart: 2,
                selectionEnd: 6,
                extendBefore: 0,
                extendAfter: 0
            });
        });

        it('⌘I は選択を * で囲む', () => {
            assert.strictEqual(applyInlineFormat('text', 'italic').insert, '*text*');
        });

        it('⌘E は選択をバッククォートで囲む', () => {
            assert.strictEqual(applyInlineFormat('text', 'code').insert, '`text`');
        });

        it('⌘⇧S は選択を ~~ で囲む', () => {
            assert.strictEqual(applyInlineFormat('text', 'strikethrough').insert, '~~text~~');
        });

        it('⌘U は Markdown に下線が無いため <u></u> で囲む', () => {
            assert.deepStrictEqual(applyInlineFormat('text', 'underline'), {
                insert: '<u>text</u>',
                selectionStart: 3,
                selectionEnd: 7,
                extendBefore: 0,
                extendAfter: 0
            });
        });

        it('⌘⇧H は選択を == で囲む（ハイライト）', () => {
            assert.strictEqual(applyInlineFormat('text', 'highlight').insert, '==text==');
        });

        it('⌘⇧M は Markdown にコメント機能が無いため HTML コメントにする', () => {
            assert.deepStrictEqual(applyInlineFormat('text', 'comment'), {
                insert: '<!-- text -->',
                selectionStart: 5,
                selectionEnd: 9,
                extendBefore: 0,
                extendAfter: 0
            });
        });
    });

    describe('囲んだ直後にもう一度押すと外れる（選択が記号の内側にある場合）', () => {
        it('**選択** の内側だけを選んだ状態で ⌘B を押すと ** が外れる', () => {
            // 直前に ⌘B した直後の状態＝選択は中身だけ、記号は選択の外側にある
            assert.deepStrictEqual(applyInlineFormat('text', 'bold', '**', '**'), {
                insert: 'text',
                selectionStart: 0,
                selectionEnd: 4,
                extendBefore: 2,
                extendAfter: 2
            });
        });

        it('<u> の内側で ⌘U を押すとタグが外れる', () => {
            const r = applyInlineFormat('text', 'underline', 'あ<u>', '</u>い');
            assert.strictEqual(r.insert, 'text');
            assert.strictEqual(r.extendBefore, 3);
            assert.strictEqual(r.extendAfter, 4);
        });

        it('片側にしか記号が無ければ外さずに囲む', () => {
            const r = applyInlineFormat('text', 'bold', '**', 'あ');
            assert.strictEqual(r.insert, '**text**');
            assert.strictEqual(r.extendBefore, 0);
            assert.strictEqual(r.extendAfter, 0);
        });
    });

    describe('もう一度押すと記法を外す（トグル）', () => {
        it('すでに ** で囲まれた選択で ⌘B を押すと ** が外れる', () => {
            assert.deepStrictEqual(applyInlineFormat('**text**', 'bold'), {
                insert: 'text',
                selectionStart: 0,
                selectionEnd: 4,
                extendBefore: 0,
                extendAfter: 0
            });
        });

        it('<u></u> で囲まれた選択で ⌘U を押すとタグが外れる', () => {
            assert.strictEqual(applyInlineFormat('<u>text</u>', 'underline').insert, 'text');
        });

        it('HTML コメントで ⌘⇧M を押すとコメントが外れる', () => {
            assert.strictEqual(applyInlineFormat('<!-- text -->', 'comment').insert, 'text');
        });

        it('記号だけで中身が無い場合は囲み直さずトグルとして扱う', () => {
            assert.strictEqual(applyInlineFormat('****', 'bold').insert, '');
        });
    });

    describe('選択が空のとき', () => {
        it('⌘B は ** を挿入してカーソルを中に置く', () => {
            assert.deepStrictEqual(applyInlineFormat('', 'bold'), {
                insert: '****',
                selectionStart: 2,
                selectionEnd: 2,
                extendBefore: 0,
                extendAfter: 0
            });
        });

        it('⌘E はバッククォートを挿入してカーソルを中に置く', () => {
            assert.deepStrictEqual(applyInlineFormat('', 'code'), {
                insert: '``',
                selectionStart: 1,
                selectionEnd: 1,
                extendBefore: 0,
                extendAfter: 0
            });
        });
    });

    describe('⌘K（リンク）', () => {
        it('選択をリンクテキストにして、カーソルは URL を打つ位置に置く', () => {
            assert.deepStrictEqual(applyInlineFormat('Anthropic', 'link'), {
                insert: '[Anthropic]()',
                selectionStart: 12,
                selectionEnd: 12,
                extendBefore: 0,
                extendAfter: 0
            });
        });

        it('選択が空なら [] () を挿入してカーソルはリンクテキストの位置に置く', () => {
            assert.deepStrictEqual(applyInlineFormat('', 'link'), {
                insert: '[]()',
                selectionStart: 1,
                selectionEnd: 1,
                extendBefore: 0,
                extendAfter: 0
            });
        });

        it('すでにリンクの選択で ⌘K を押すとリンクが外れてテキストだけ残る', () => {
            assert.deepStrictEqual(applyInlineFormat('[text](https://example.com)', 'link'), {
                insert: 'text',
                selectionStart: 0,
                selectionEnd: 4,
                extendBefore: 0,
                extendAfter: 0
            });
        });

        it('URL が空のリンクでも外せる', () => {
            assert.strictEqual(applyInlineFormat('[text]()', 'link').insert, 'text');
        });
    });
});
