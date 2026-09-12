/**
 * Markdown を「パネルだけのグループ」へ開いてしまったときの移動先の判定（純関数）。
 *
 * ユーザー報告（2026-09-12）: Claude Code のセッションやターミナルを開いている側の
 * エディタグループにフォーカスがあると、左サイドバーから .md をクリックしたときに
 * そのグループ（＝作業していない方）に開いてしまう。本来は文書を並べている
 * 左側のグループで開いてほしい。
 *
 * VS Code は「アクティブなグループに開く」ので、拡張側で開いた直後に文書グループへ
 * 移す。判定だけをここで純関数として固定する（実際の移動は実 VS Code テスト）。
 */
import * as assert from 'assert';
import { chooseDocumentGroup, type GroupTabLike } from '../../../../src/live/host/editorGroups';

const doc = (uri: string): GroupTabLike => ({ kind: 'document', uri });
const panel = (): GroupTabLike => ({ kind: 'panel' });

describe('Live モード: Markdown を開くエディタグループの選択', () => {
    it('開いたグループに他の文書タブがあれば動かさない', () => {
        const groups = [[doc('a.md'), doc('b.md')], [panel()]];
        assert.strictEqual(chooseDocumentGroup(groups, 0, 'b.md'), null);
    });

    it('パネルだけのグループに開かれたら、文書タブのあるグループへ移す', () => {
        const groups = [[doc('a.md')], [panel(), doc('b.md')]];
        assert.strictEqual(chooseDocumentGroup(groups, 1, 'b.md'), 0);
    });

    it('ターミナルや Claude のタブは文書として数えない', () => {
        const groups = [[doc('a.md')], [panel(), panel()]];
        assert.strictEqual(chooseDocumentGroup(groups, 1, 'b.md'), 0);
    });

    it('文書グループが左右にあるときは左を選ぶ', () => {
        const groups = [[doc('a.md')], [panel(), doc('b.md')], [doc('c.md')]];
        assert.strictEqual(chooseDocumentGroup(groups, 1, 'b.md'), 0);
    });

    it('文書グループが右にしか無ければ右を選ぶ', () => {
        const groups = [[panel(), doc('b.md')], [doc('c.md')]];
        assert.strictEqual(chooseDocumentGroup(groups, 0, 'b.md'), 1);
    });

    it('どのグループにも文書が無ければ動かさない（唯一の編集場所を奪わない）', () => {
        const groups = [[panel()], [panel(), doc('b.md')]];
        assert.strictEqual(chooseDocumentGroup(groups, 1, 'b.md'), null);
    });

    it('同じファイルの別タブは「他の文書」と数えない（自分自身に留まらない）', () => {
        // Raw タブが同じグループに残っている最中でも、パネルのグループなら出ていく
        const groups = [[doc('a.md')], [panel(), doc('b.md'), doc('b.md')]];
        assert.strictEqual(chooseDocumentGroup(groups, 1, 'b.md'), 0);
    });

    it('グループが1つしか無ければ動かさない', () => {
        const groups = [[panel(), doc('b.md')]];
        assert.strictEqual(chooseDocumentGroup(groups, 0, 'b.md'), null);
    });
});
