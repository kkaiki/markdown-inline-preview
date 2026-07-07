/**
 * エディタ・タイトルバーの Preview/Raw トグルボタン（package.json の貢献）の回帰防止。
 *
 * 以前は Raw では「Preview を開く」($(open-preview))、Preview では「Raw を開く」($(code))と、
 * モードごとに**別コマンド・別アイコン**の2種類を出し分けていた。アイコンが2種類あると
 * 紛らわしいという指摘を受け、**常に同じ1つのアイコン**（`markdownInline.togglePreview`,
 * `$(book)`）に統一した。クリックすると現在のモードに応じて Raw⇄Preview を切り替える。
 * ※テキストエディタ内に浮動固定ウィジェットは API 上作れないため、上部固定はここ（タイトルバー）。
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

interface MenuItem { command?: string; when?: string; group?: string; }
interface CommandDef { command?: string; icon?: string; }

describe('editor/title: Preview/Raw トグルボタン', () => {
    const pkg = JSON.parse(
        fs.readFileSync(path.join(__dirname, '../../../../../package.json'), 'utf8')
    ) as { contributes?: { menus?: { 'editor/title'?: MenuItem[] }; commands?: CommandDef[] } };
    const items: MenuItem[] = pkg.contributes?.menus?.['editor/title'] ?? [];
    const commands: CommandDef[] = pkg.contributes?.commands ?? [];

    it('togglePreview だけを、Raw・Preview どちらでも出す単一の when 条件で上部に出す', () => {
        const item = items.find((i) => i.command === 'markdownInline.togglePreview');
        assert.ok(item, 'togglePreview が editor/title に無い');
        assert.ok(/editorLangId\s*==\s*markdown/.test(item?.when ?? ''), `when が markdown 連動でない: ${item?.when}`);
        assert.ok(/ipreview\.preview/.test(item?.when ?? ''), `when が preview カスタムエディタ連動でない: ${item?.when}`);
    });

    it('togglePreview は navigation グループ（タイトルバー右上）に置く', () => {
        const item = items.find((i) => i.command === 'markdownInline.togglePreview');
        assert.ok((item?.group ?? '').startsWith('navigation'), 'togglePreview が navigation グループでない');
    });

    it('togglePreview のアイコンは常に同じ $(book)（モードで切り替わらない）', () => {
        const cmd = commands.find((c) => c.command === 'markdownInline.togglePreview');
        assert.strictEqual(cmd?.icon, '$(book)', `アイコンが想定と違う: ${cmd?.icon}`);
    });

    it('openPreview / openRaw はモード別の別アイコンとして editor/title には出さない（1アイコンに統一）', () => {
        for (const cmd of ['markdownInline.openPreview', 'markdownInline.openRaw']) {
            assert.strictEqual(
                items.find((i) => i.command === cmd),
                undefined,
                `${cmd} がまだ editor/title に残っている（togglePreview 単一アイコンへ統一したはず）`
            );
        }
    });
});
