/**
 * エディタ・タイトルバーの Preview/Raw トグルボタン（package.json の貢献）の回帰防止。
 *
 * Raw（テキストエディタ）では「Preview を開く」、Preview（カスタムエディタ）では「Raw を開く」
 * ボタンが常に上部に固定表示されること（モード連動）を、設定レベルで保証する。
 * ※テキストエディタ内に浮動固定ウィジェットは API 上作れないため、上部固定はここ（タイトルバー）。
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

interface MenuItem { command?: string; when?: string; group?: string; }

describe('editor/title: Preview/Raw トグルボタン', () => {
    const pkg = JSON.parse(
        fs.readFileSync(path.join(__dirname, '../../../package.json'), 'utf8')
    ) as { contributes?: { menus?: { 'editor/title'?: MenuItem[] } } };
    const items: MenuItem[] = pkg.contributes?.menus?.['editor/title'] ?? [];

    it('Raw（markdown テキストエディタ）で openPreview を上部に出す', () => {
        const item = items.find((i) => i.command === 'markdownInline.openPreview');
        assert.ok(item, 'openPreview が editor/title に無い');
        assert.ok(/editorLangId\s*==\s*markdown/.test(item.when ?? ''), `when が markdown 連動でない: ${item.when}`);
    });

    it('Preview（カスタムエディタ）で openRaw を上部に出す', () => {
        const item = items.find((i) => i.command === 'markdownInline.openRaw');
        assert.ok(item, 'openRaw が editor/title に無い');
        assert.ok(/ipreview\.preview/.test(item.when ?? ''), `when が preview カスタムエディタ連動でない: ${item.when}`);
    });

    it('両ボタンは navigation グループ（タイトルバー右上）に置く', () => {
        for (const cmd of ['markdownInline.openPreview', 'markdownInline.openRaw']) {
            const item = items.find((i) => i.command === cmd);
            assert.ok((item?.group ?? '').startsWith('navigation'), `${cmd} が navigation グループでない`);
        }
    });
});
