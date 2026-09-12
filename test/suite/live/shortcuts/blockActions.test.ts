/**
 * Notion 風のブロック変換（⌥⌘0〜9）の純関数テスト。
 *
 * 対応表は Raw / Preview と共通の `NOTION_BLOCK_KEYMAP` を使う。
 * Live モードはドキュメントが生 Markdown なので、変換は「行頭のプレフィックスを
 * 差し替えるだけ」で済む。既存のプレフィックスを消し忘れると
 * `## - 項目` のような壊れた行になるため、種別をまたぐ変換を重点的に固定する。
 */
import * as assert from 'assert';
import { applyBlockAction, wrapBlockAction } from '../../../../src/live/shared/blockActions';
import { getNotionBlockAction } from '../../../../src/shared/notionBlockKeymap';

describe('Live モード: ブロック変換', () => {
    it('段落を見出し1にする', () => {
        assert.deepStrictEqual(applyBlockAction('本文', 'heading1'), { text: '# 本文', contentStart: 2 });
    });

    it('見出しレベルを変える（既存の # を消してから付ける）', () => {
        assert.strictEqual(applyBlockAction('# 本文', 'heading3')?.text, '### 本文');
        assert.strictEqual(applyBlockAction('### 本文', 'heading1')?.text, '# 本文');
    });

    it('見出しを段落に戻す', () => {
        assert.deepStrictEqual(applyBlockAction('## 本文', 'paragraph'), { text: '本文', contentStart: 0 });
    });

    it('箇条書きにする', () => {
        assert.strictEqual(applyBlockAction('本文', 'bulletList')?.text, '- 本文');
    });

    it('番号リストにする', () => {
        assert.strictEqual(applyBlockAction('本文', 'orderedList')?.text, '1. 本文');
    });

    it('チェックボックスにする', () => {
        assert.deepStrictEqual(applyBlockAction('本文', 'todo'), { text: '- [ ] 本文', contentStart: 6 });
    });

    it('引用にする', () => {
        assert.strictEqual(applyBlockAction('本文', 'blockquote')?.text, '> 本文');
    });

    describe('種別をまたぐ変換（プレフィックスの二重付与を防ぐ）', () => {
        it('箇条書き → 見出し', () => {
            assert.strictEqual(applyBlockAction('- 項目', 'heading1')?.text, '# 項目');
        });
        it('チェックボックス → 見出し', () => {
            assert.strictEqual(applyBlockAction('- [ ] タスク', 'heading1')?.text, '# タスク');
        });
        it('チェックボックス → 箇条書き', () => {
            assert.strictEqual(applyBlockAction('- [x] タスク', 'bulletList')?.text, '- タスク');
        });
        it('番号リスト → チェックボックス', () => {
            assert.strictEqual(applyBlockAction('3. 項目', 'todo')?.text, '- [ ] 項目');
        });
        it('引用 → 箇条書き', () => {
            assert.strictEqual(applyBlockAction('> 引用', 'bulletList')?.text, '- 引用');
        });
        it('見出し → 番号リスト', () => {
            assert.strictEqual(applyBlockAction('## 見出し', 'orderedList')?.text, '1. 見出し');
        });
    });

    it('インデントは保つ', () => {
        assert.strictEqual(applyBlockAction('    - 項目', 'todo')?.text, '    - [ ] 項目');
    });

    it('同じ種別をもう一度当てても壊れない', () => {
        assert.strictEqual(applyBlockAction('# 本文', 'heading1')?.text, '# 本文');
    });

    it('空行にも当てられる', () => {
        assert.deepStrictEqual(applyBlockAction('', 'bulletList'), { text: '- ', contentStart: 2 });
    });

    it('コードブロックは行の置換では表せないので null を返す', () => {
        assert.strictEqual(applyBlockAction('本文', 'codeBlock'), null);
    });

    it('トグルリストも行の置換では表せないので null を返す', () => {
        assert.strictEqual(applyBlockAction('本文', 'toggleList'), null);
    });
});

describe('複数行にまたがるブロック変換（⌥⌘7 / ⌥⌘8）', () => {
    it('⌥⌘8 は選択をコードフェンスで包む', () => {
        assert.strictEqual(wrapBlockAction('const a = 1;', 'codeBlock'), '```\nconst a = 1;\n```');
    });

    it('⌥⌘7 は 1 行目を summary にした <details> にする', () => {
        assert.strictEqual(
            wrapBlockAction('たたむ見出し', 'toggleList'),
            '<details>\n<summary>たたむ見出し</summary>\n\n\n</details>'
        );
    });

    it('⌥⌘7 で複数行を選ぶと 2 行目以降が中身になる', () => {
        assert.strictEqual(
            wrapBlockAction('見出し\n中身1\n中身2', 'toggleList'),
            '<details>\n<summary>見出し</summary>\n\n中身1\n中身2\n</details>'
        );
    });
});

describe('Notion のブロック変換キー対応表', () => {
    it('0〜9 の割り当ては Notion と同じ（9 だけは引用として使う）', () => {
        assert.deepStrictEqual(
            [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => getNotionBlockAction(n)),
            [
                'paragraph',
                'heading1',
                'heading2',
                'heading3',
                'todo',
                'bulletList',
                'orderedList',
                'toggleList',
                'codeBlock',
                'blockquote'
            ]
        );
    });

    it('割り当ての無い数字は null', () => {
        assert.strictEqual(getNotionBlockAction(10), null);
    });
});
