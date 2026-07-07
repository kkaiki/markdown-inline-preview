/**
 * pickPreviewUri（Preview タブ選択ロジック）のユニットテスト。
 *
 * 回帰の主眼: 複数の Preview を開いた状態で「Raw に戻す対象」を取り違えて
 * 別ファイルへ飛ばないこと（曖昧なときは undefined を返す）。
 */
import * as assert from 'assert';
import { pickPreviewUri, type PreviewTabInfo } from '../../../../src/preview/host/previewTabs';

function tab(partial: Partial<PreviewTabInfo>): PreviewTabInfo {
    return { isActiveGroup: false, isActiveTab: false, ...partial };
}

describe('pickPreviewUri', () => {
    it('アクティブグループのアクティブタブが Preview ならそれを返す', () => {
        const tabs: PreviewTabInfo[] = [
            tab({ isActiveGroup: true, isActiveTab: true, previewUri: 'file:///a.md' }),
            tab({ previewUri: 'file:///b.md' })
        ];
        assert.strictEqual(pickPreviewUri(tabs), 'file:///a.md');
    });

    it('複数の Preview があってもアクティブな方を正しく選ぶ（別ファイルへ飛ばない）', () => {
        const tabs: PreviewTabInfo[] = [
            tab({ isActiveGroup: false, previewUri: 'file:///a.md' }),
            tab({ isActiveGroup: true, isActiveTab: true, previewUri: 'file:///b.md' })
        ];
        assert.strictEqual(pickPreviewUri(tabs), 'file:///b.md');
    });

    it('アクティブタブが Preview でない（テキスト等）ときはアクティブな Preview を採らない', () => {
        const tabs: PreviewTabInfo[] = [
            // アクティブタブは普通のテキスト（previewUri なし）
            tab({ isActiveGroup: true, isActiveTab: true }),
            // 非アクティブの Preview が 1 枚だけ → 一意なので返す
            tab({ isActiveGroup: true, isActiveTab: false, previewUri: 'file:///only.md' })
        ];
        assert.strictEqual(pickPreviewUri(tabs), 'file:///only.md');
    });

    it('Preview が 1 枚だけならアクティブでなくてもそれを返す', () => {
        const tabs: PreviewTabInfo[] = [
            tab({ isActiveGroup: true, isActiveTab: true }),
            tab({ isActiveGroup: false, isActiveTab: false, previewUri: 'file:///solo.md' })
        ];
        assert.strictEqual(pickPreviewUri(tabs), 'file:///solo.md');
    });

    it('Preview が複数あり、どれもアクティブでない → 曖昧なので undefined（誤爆防止）', () => {
        const tabs: PreviewTabInfo[] = [
            tab({ previewUri: 'file:///a.md' }),
            tab({ previewUri: 'file:///b.md' })
        ];
        assert.strictEqual(pickPreviewUri(tabs), undefined);
    });

    it('同一 URI の Preview が複数タブにあっても一意とみなして返す', () => {
        const tabs: PreviewTabInfo[] = [
            tab({ previewUri: 'file:///same.md' }),
            tab({ previewUri: 'file:///same.md' })
        ];
        assert.strictEqual(pickPreviewUri(tabs), 'file:///same.md');
    });

    it('Preview タブが 1 枚も無ければ undefined', () => {
        const tabs: PreviewTabInfo[] = [
            tab({ isActiveGroup: true, isActiveTab: true }),
            tab({})
        ];
        assert.strictEqual(pickPreviewUri(tabs), undefined);
    });

    it('空配列なら undefined', () => {
        assert.strictEqual(pickPreviewUri([]), undefined);
    });
});
