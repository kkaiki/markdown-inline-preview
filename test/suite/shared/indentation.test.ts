/**
 * リストのインデント（Tab / Shift+Tab）の幅を、VS Code の設定に合わせられること（`src/shared/indentation.ts`）。
 *
 * 報告（GitHub イシュー #3）:「拡張が VS Code のインデント設定を無視して、半角スペース 2 つになる」。
 * 既定の見た目を変えないよう、設定 `markdownInline.indentation` が `editor` のときだけ、
 * `editor.tabSize` / `editor.insertSpaces` に従う（`default` は従来どおり: Raw は半角スペース 2 つ、Live はタブ 1 文字）。
 */
import * as assert from 'assert';
import {
    resolveIndentStyle,
    indentLine,
    outdentLine,
    LEGACY_RAW_INDENT,
    LEGACY_LIVE_INDENT
} from '../../../src/shared/indentation';

describe('インデント幅の決め方', () => {
    describe('default（従来どおり）', () => {
        it('Raw は半角スペース 2 つ、Live はタブ 1 文字。VS Code の設定は見ない', () => {
            const options = { tabSize: 8, insertSpaces: false };
            assert.deepStrictEqual(resolveIndentStyle('default', options, LEGACY_RAW_INDENT), LEGACY_RAW_INDENT);
            assert.deepStrictEqual(resolveIndentStyle('default', options, LEGACY_LIVE_INDENT), LEGACY_LIVE_INDENT);
            assert.strictEqual(LEGACY_RAW_INDENT.unit, '  ');
            assert.strictEqual(LEGACY_LIVE_INDENT.unit, '\t');
        });
    });

    describe('editor（VS Code の設定に従う）', () => {
        it('スペースで tabSize 4 なら、半角スペース 4 つ', () => {
            assert.deepStrictEqual(resolveIndentStyle('editor', { tabSize: 4, insertSpaces: true }, LEGACY_RAW_INDENT), { unit: '    ', tabSize: 4 });
        });

        it('スペースで tabSize 2 なら、半角スペース 2 つ', () => {
            assert.strictEqual(resolveIndentStyle('editor', { tabSize: 2, insertSpaces: true }, LEGACY_RAW_INDENT).unit, '  ');
        });

        it('insertSpaces が false なら、タブ 1 文字（tabSize は見た目の幅として持つ）', () => {
            assert.deepStrictEqual(resolveIndentStyle('editor', { tabSize: 4, insertSpaces: false }, LEGACY_RAW_INDENT), { unit: '\t', tabSize: 4 });
        });

        it('VS Code が文字列で返す値（"auto" など）や未指定は、既定（スペース 4 つ）として扱う', () => {
            assert.deepStrictEqual(resolveIndentStyle('editor', { tabSize: 'auto', insertSpaces: 'auto' }, LEGACY_RAW_INDENT), { unit: '    ', tabSize: 4 });
            assert.deepStrictEqual(resolveIndentStyle('editor', undefined, LEGACY_RAW_INDENT), { unit: '    ', tabSize: 4 });
            assert.strictEqual(resolveIndentStyle('editor', { tabSize: '2', insertSpaces: 'true' }, LEGACY_RAW_INDENT).unit, '  ');
        });

        it('tabSize は 1〜8 に収める（極端な値で行が壊れない）', () => {
            assert.strictEqual(resolveIndentStyle('editor', { tabSize: 0, insertSpaces: true }, LEGACY_RAW_INDENT).unit, ' ');
            assert.strictEqual(resolveIndentStyle('editor', { tabSize: 99, insertSpaces: true }, LEGACY_RAW_INDENT).unit, ' '.repeat(8));
        });
    });
});

describe('行のインデントの増減', () => {
    const four = { unit: '    ', tabSize: 4 };
    const tab = { unit: '\t', tabSize: 4 };

    it('増やす: 行頭にインデントの 1 単位を足す', () => {
        assert.strictEqual(indentLine('- a', four), '    - a');
        assert.strictEqual(indentLine('- a', tab), '\t- a');
        assert.strictEqual(indentLine('- a', LEGACY_RAW_INDENT), '  - a');
    });

    it('減らす（スペース）: tabSize 分までの先頭のスペースを取る', () => {
        assert.strictEqual(outdentLine('    - a', four), '- a');
        assert.strictEqual(outdentLine('        - a', four), '    - a');
        assert.strictEqual(outdentLine('  - a', four), '- a'); // 従来の 2 スペースの行は、あるだけ取る
        assert.strictEqual(outdentLine(' - a', four), '- a');
    });

    it('減らす（タブ）: 先頭のタブ 1 つを取る。混在していてもタブが先ならタブを取る', () => {
        assert.strictEqual(outdentLine('\t- a', tab), '- a');
        assert.strictEqual(outdentLine('\t\t- a', tab), '\t- a');
        assert.strictEqual(outdentLine('\t    - a', four), '    - a');
    });

    it('減らす: インデントが無い行は、そのまま', () => {
        assert.strictEqual(outdentLine('- a', four), '- a');
        assert.strictEqual(outdentLine('', four), '');
    });

    it('従来（Raw の半角スペース 2 つ）の増減は、これまでと同じ', () => {
        assert.strictEqual(outdentLine('  - a', LEGACY_RAW_INDENT), '- a');
        assert.strictEqual(outdentLine(' - a', LEGACY_RAW_INDENT), '- a');
        assert.strictEqual(outdentLine('    - a', LEGACY_RAW_INDENT), '  - a');
    });
});
