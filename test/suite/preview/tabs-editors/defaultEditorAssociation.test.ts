/**
 * `.md` の既定エディタ（VS Code 本体の `workbench.editorAssociations`）を、
 * 現在の Raw/Preview モードに追従させるための純関数を検証する。
 *
 * なぜ必要か: customEditor の `priority: "default"` だけでは、Raw モードでも
 * 一度 Preview の Custom Editor が生成されてから Raw へ跳ね返る（bounceToRawEditor）。
 * この「2手」がちらつきと一瞬のタブ2枚並存の原因であり、さらに同じく
 * `priority: default` を名乗る他拡張（例: cweijan.vscode-office）が居ると
 * どちらが開くか VS Code 側で一意に決まらない。ユーザー設定の
 * `workbench.editorAssociations` は拡張機能の宣言より強いので、ここを
 * モードに同期させれば「開く前から解決先が1つに決まっている」状態を作れる。
 *
 * 層: jsdom（純関数）。実際に設定へ書き込む経路は
 * `test/extension/preview/settings.test.ts`（実 VS Code）が担当する。
 */
import * as assert from 'assert';
import {
    computeEditorAssociations,
    editorAssociationsEqual,
    resolveDefaultOpenMode,
    MANAGED_ASSOCIATION_PATTERNS,
    PREVIEW_VIEW_TYPE,
    TEXT_EDITOR_VIEW_TYPE
} from '../../../../src/preview/host/defaultEditorAssociation';

describe('defaultEditorAssociation', () => {

    describe('resolveDefaultOpenMode（次に開く Markdown をどちらで開くか）', () => {
        it('記憶モードがあればそれを使う', () => {
            assert.strictEqual(
                resolveDefaultOpenMode({ remembered: 'raw', defaultMode: 'preview' }),
                'raw'
            );
            assert.strictEqual(
                resolveDefaultOpenMode({ remembered: 'preview', defaultMode: 'raw' }),
                'preview'
            );
        });

        it('記憶モードが無ければ defaultMode 設定を使う', () => {
            assert.strictEqual(resolveDefaultOpenMode({ defaultMode: 'raw' }), 'raw');
            assert.strictEqual(resolveDefaultOpenMode({ defaultMode: 'preview' }), 'preview');
        });

        it('どちらも無ければ preview（package.json の既定値と揃える）', () => {
            assert.strictEqual(resolveDefaultOpenMode({}), 'preview');
        });

        it('未知の defaultMode 値は preview として扱う（設定の手書きミスで壊さない）', () => {
            assert.strictEqual(resolveDefaultOpenMode({ defaultMode: 'wysiwyg' }), 'preview');
        });
    });

    describe('computeEditorAssociations（本体設定へ書き戻す値の計算）', () => {
        it('preview モードでは *.md / *.markdown を Preview の viewType に向ける', () => {
            const next = computeEditorAssociations(undefined, 'preview');
            for (const pattern of MANAGED_ASSOCIATION_PATTERNS) {
                assert.strictEqual(next[pattern], PREVIEW_VIEW_TYPE, `${pattern} が Preview に向いていない`);
            }
        });

        it('raw モードでは *.md / *.markdown を VS Code 標準テキストエディタに向ける', () => {
            const next = computeEditorAssociations(undefined, 'raw');
            for (const pattern of MANAGED_ASSOCIATION_PATTERNS) {
                assert.strictEqual(next[pattern], TEXT_EDITOR_VIEW_TYPE, `${pattern} が既定エディタに向いていない`);
            }
        });

        it('管理対象外のパターン（他拡張のための関連付け）は書き換えない', () => {
            const current = {
                '*.svg': 'imagePreview.previewEditor',
                '*.pdf': 'cweijan.pdfViewer'
            };
            const next = computeEditorAssociations(current, 'raw');
            assert.strictEqual(next['*.svg'], 'imagePreview.previewEditor');
            assert.strictEqual(next['*.pdf'], 'cweijan.pdfViewer');
        });

        it('*.md が他拡張のビューアに向いていてもモード側で上書きする（競合の解消が目的のため）', () => {
            const current = { '*.md': 'cweijan.markdownViewer' };
            const next = computeEditorAssociations(current, 'preview');
            assert.strictEqual(next['*.md'], PREVIEW_VIEW_TYPE);
        });

        it('制御 OFF（null）では、自分が書いた値だけを取り除く', () => {
            const current = {
                '*.md': PREVIEW_VIEW_TYPE,
                '*.markdown': TEXT_EDITOR_VIEW_TYPE,
                '*.svg': 'imagePreview.previewEditor'
            };
            const next = computeEditorAssociations(current, null);
            assert.ok(!('*.md' in next), '制御 OFF で *.md が残っている');
            assert.ok(!('*.markdown' in next), '制御 OFF で *.markdown が残っている');
            assert.strictEqual(next['*.svg'], 'imagePreview.previewEditor', '無関係な関連付けまで消している');
        });

        it('制御 OFF でも、自分が書いた値でない *.md の関連付けは残す', () => {
            const current = { '*.md': 'cweijan.markdownViewer' };
            const next = computeEditorAssociations(current, null);
            assert.strictEqual(next['*.md'], 'cweijan.markdownViewer');
        });
    });

    describe('editorAssociationsEqual（無駄な settings.json 書き込みを避ける）', () => {
        it('同じ内容なら true（モード切替のたびに書き込まない）', () => {
            assert.strictEqual(
                editorAssociationsEqual({ '*.md': PREVIEW_VIEW_TYPE }, { '*.md': PREVIEW_VIEW_TYPE }),
                true
            );
        });

        it('キーの順序が違うだけなら true', () => {
            assert.strictEqual(
                editorAssociationsEqual(
                    { '*.md': PREVIEW_VIEW_TYPE, '*.svg': 'x' },
                    { '*.svg': 'x', '*.md': PREVIEW_VIEW_TYPE }
                ),
                true
            );
        });

        it('値が違えば false', () => {
            assert.strictEqual(
                editorAssociationsEqual({ '*.md': PREVIEW_VIEW_TYPE }, { '*.md': TEXT_EDITOR_VIEW_TYPE }),
                false
            );
        });

        it('undefined と空オブジェクトは同じ扱い（未設定 ⇔ 空を往復させない）', () => {
            assert.strictEqual(editorAssociationsEqual(undefined, {}), true);
        });

        it('キーが増えていれば false', () => {
            assert.strictEqual(
                editorAssociationsEqual({ '*.md': PREVIEW_VIEW_TYPE }, { '*.md': PREVIEW_VIEW_TYPE, '*.markdown': PREVIEW_VIEW_TYPE }),
                false
            );
        });
    });
});
