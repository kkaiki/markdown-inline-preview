/**
 * エディタ右上（editor/title）のボタン宣言が「モードに応じて出し分ける」こと。
 *
 * Raw（標準テキストエディタ）で開いているときは「Live モードで開く」を出し、
 * Live で開いているときは切り替えボタン（Raw へ戻す）を出す。
 * どちらのモードでも両方が並ぶと、どちらを押せばよいか分からなくなるため。
 *
 * 表示そのもの（Cursor 上の見え方）は拡張ホストからは検査できないので、
 * ここでは `package.json` の `when` 句を、Raw / Live それぞれのコンテキストで評価して守る。
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

interface MenuItem {
    command: string;
    when?: string;
    group?: string;
}

const repoRoot = (() => {
    let dir = __dirname;
    while (!fs.existsSync(path.join(dir, 'package.json'))) dir = path.dirname(dir);
    return dir;
})();

const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')) as {
    contributes: { menus: Record<string, MenuItem[]> };
};
const titleMenu = pkg.contributes.menus['editor/title'];

type Context = Record<string, string | boolean>;

/** `a == 'x'` / `a != 'x'` / `!a` / `a` を `&&` `||` でつないだ when 句を評価する（本テストに必要な範囲）。 */
function evalWhen(when: string | undefined, ctx: Context): boolean {
    if (!when) return true;
    return when.split('||').some((orPart) =>
        orPart.split('&&').every((term) => {
            const t = term.trim();
            let m = /^(\w+)\s*==\s*'?([^']*)'?$/.exec(t);
            if (m) return String(ctx[m[1]] ?? '') === m[2];
            m = /^(\w+)\s*!=\s*'?([^']*)'?$/.exec(t);
            if (m) return String(ctx[m[1]] ?? '') !== m[2];
            m = /^!(\w+)$/.exec(t);
            if (m) return !ctx[m[1]];
            return Boolean(ctx[t]);
        })
    );
}

/** その状況でタイトルバーに出るコマンド。 */
function visibleCommands(ctx: Context): string[] {
    return titleMenu.filter((i) => evalWhen(i.when, ctx)).map((i) => i.command);
}

const RAW: Context = { editorLangId: 'markdown' };
const LIVE: Context = { activeCustomEditorId: 'ipreview.live' };
const NOT_MARKDOWN: Context = { editorLangId: 'typescript' };

describe('エディタ右上のボタン（モード別の出し分け）', () => {
    it('Raw で開いているときは「Live モードで開く」ボタンが出る', () => {
        assert.ok(visibleCommands(RAW).includes('markdownInline.openLive'));
    });

    it('Raw で開いているときに、切り替えボタンを重複して出さない', () => {
        assert.ok(!visibleCommands(RAW).includes('markdownInline.toggleLive'));
    });

    it('Live で開いているときは切り替えボタン（Raw へ戻す）が出て、「Live で開く」は出ない', () => {
        const shown = visibleCommands(LIVE);
        assert.ok(shown.includes('markdownInline.toggleLive'));
        assert.ok(!shown.includes('markdownInline.openLive'));
    });

    it('Markdown 以外のファイルにはどちらのボタンも出ない', () => {
        assert.deepStrictEqual(
            visibleCommands(NOT_MARKDOWN).filter((c) => c.startsWith('markdownInline.')),
            []
        );
    });
});
