/**
 * Notion 風のブロック変換（⌥⌘0〜9）の純関数テスト。
 *
 * 対応表は Raw / Preview と共通の `NOTION_BLOCK_KEYMAP` を使う。
 * Live モードはドキュメントが生 Markdown なので、変換は「行頭のプレフィックスを
 * 差し替えるだけ」で済む。既存のプレフィックスを消し忘れると
 * `## - 項目` のような壊れた行になるため、種別をまたぐ変換を重点的に固定する。
 */
import * as assert from 'assert';
import { applyBlockAction } from '../../../../src/live/shared/blockActions';

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
});
