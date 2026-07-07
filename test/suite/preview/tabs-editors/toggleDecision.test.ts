/**
 * decidePreviewToggle（Raw ⇄ Preview 切替判定）のユニットテスト。
 *
 * 回帰の主眼（ユーザー報告）: 他のファイルが Preview で開いていると、Raw で編集中の
 * ファイルに対する toggle が効かず、別ファイルの Preview が Raw に戻ってしまう。
 */
import * as assert from 'assert';
import { decidePreviewToggle, type ToggleContext } from '../../../../src/preview/host/toggleDecision';

function ctx(partial: Partial<ToggleContext>): ToggleContext {
    return { activeEditorIsRawMarkdown: false, ...partial };
}

describe('decidePreviewToggle', () => {
    it('Raw の Markdown を編集中なら、そのファイルを Preview にする', () => {
        const action = decidePreviewToggle(ctx({
            activeEditorIsRawMarkdown: true,
            activeMarkdownUri: 'file:///a.md'
        }));
        assert.deepStrictEqual(action, { kind: 'toPreview', uri: 'file:///a.md' });
    });

    it('【再現】別ファイルが Preview 中でも、Raw 編集中のファイルを Preview にする（別ファイルを Raw に戻さない）', () => {
        // ユーザーは a.md を Raw で編集中。b.md が別グループで Preview。
        // a.md を Preview にしたいのに、現状は b.md の Preview を Raw に戻してしまう。
        const action = decidePreviewToggle(ctx({
            activeEditorIsRawMarkdown: true,
            activeMarkdownUri: 'file:///a.md',
            resolvedPreviewUri: 'file:///b.md' // pickPreviewUri が唯一の Preview として返す
        }));
        assert.deepStrictEqual(
            action,
            { kind: 'toPreview', uri: 'file:///a.md' },
            '別ファイル b.md の Preview を掴んでしまっている（バグ）'
        );
    });

    it('Preview にフォーカス中（Raw エディタ非アクティブ）なら、その Preview を Raw に戻す', () => {
        const action = decidePreviewToggle(ctx({
            activeEditorIsRawMarkdown: false,
            resolvedPreviewUri: 'file:///a.md'
        }));
        assert.deepStrictEqual(action, { kind: 'toRaw', uri: 'file:///a.md' });
    });

    it('Markdown でも Preview でもなければ何もしない', () => {
        assert.deepStrictEqual(decidePreviewToggle(ctx({})), { kind: 'none' });
    });
});
