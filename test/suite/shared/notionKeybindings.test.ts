/**
 * `package.json` のキーバインド宣言が仕様（`docs/specifications/notion-shortcuts.md` §3・§4）
 * どおりであること。
 *
 * キー入力そのもの（「⌘B を押したら太字になる」）は拡張ホストからは駆動できず、
 * 実機の手動確認に頼っている（testing-rules.md の既知のギャップ）。
 * せめて**宣言**は機械的に守る: 打ち消す既定コマンドの取りこぼし、`when` 句の付け忘れ
 * （＝設定を切っても VS Code 既定へ戻らない）をここで止める。
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

interface Keybinding {
    command: string;
    key?: string;
    mac?: string;
    win?: string;
    linux?: string;
    when?: string;
}

const repoRoot = (() => {
    let dir = __dirname;
    while (!fs.existsSync(path.join(dir, 'package.json'))) dir = path.dirname(dir);
    return dir;
})();

const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')) as {
    contributes: { keybindings: Keybinding[] };
};
const bindings = pkg.contributes.keybindings;

/** 仕様 §3.2 の打ち消し表（macOS のキー → 打ち消す既定コマンド）。 */
const CANCELLED_DEFAULTS: [string, string][] = [
    ['cmd+b', 'workbench.action.toggleSidebarVisibility'],
    ['cmd+i', 'inlineChat.start'],
    ['cmd+u', 'cursorUndo'],
    ['cmd+e', 'actions.findWithSelection'],
    ['cmd+d', 'editor.action.addSelectionToNextFindMatch'],
    ['cmd+shift+s', 'workbench.action.files.saveAs'],
    ['cmd+shift+m', 'workbench.actions.view.problems'],
    ['cmd+shift+h', 'workbench.action.replaceInFiles']
];

/** 修飾キーの並び順は宣言によって違う（`shift+cmd+s` / `cmd+shift+s`）ので揃えて比べる。 */
function sameKey(a: string | undefined, b: string): boolean {
    const norm = (k: string): string => k.toLowerCase().split('+').sort().join('+');
    return a !== undefined && norm(a) === norm(b);
}

describe('Notion 準拠キーバインドの宣言（package.json）', () => {
    describe('§3.2 Live モード: VS Code 既定の打ち消し', () => {
        for (const [mac, command] of CANCELLED_DEFAULTS) {
            it(`${mac} の既定 ${command} を打ち消している`, () => {
                const found = bindings.find((b) => b.command === `-${command}` && sameKey(b.mac, mac));
                assert.ok(found, `負のキーバインドが無い: -${command} (${mac})`);
            });
        }

        it('負のキーバインドは Live のときだけ効く（他のエディタの既定を壊さない）', () => {
            const wrong = bindings
                .filter((b) => b.command.startsWith('-'))
                .filter((b) => !(b.when ?? '').includes("activeCustomEditorId == 'ipreview.live'"))
                .map((b) => b.command);
            assert.deepStrictEqual(wrong, []);
        });

        it('負のキーバインドは設定を切ると外れる（when に notionKeymap を含む）', () => {
            const wrong = bindings
                .filter((b) => b.command.startsWith('-'))
                .filter((b) => !(b.when ?? '').includes('markdownInline.notionKeymap'))
                .map((b) => b.command);
            assert.deepStrictEqual(wrong, []);
        });

        it('⌘K は chord を起こさないよう noop に割り当てる（負のキーバインドでは消せない）', () => {
            const cmdK = bindings.find((b) => sameKey(b.mac, 'cmd+k') && b.command === 'markdownInline.noop');
            assert.ok(cmdK, '⌘K の noop 割り当てが無い');
            assert.ok(
                (cmdK.when ?? '').includes("activeCustomEditorId == 'ipreview.live'"),
                '⌘K の noop が Live 以外でも効いてしまう'
            );
        });
    });

    describe('§1.2 ⌘⇧0（Notion の「テキストに変換」）', () => {
        it('Raw: ⌘⇧0 が「本文に変換」に割り当てられ、markdown のときだけ効く（設定を切ると外れる）', () => {
            const found = bindings.find((b) => b.command === 'markdownInline.convertToNormal' && sameKey(b.mac, 'cmd+shift+0'));
            assert.ok(found, '⌘⇧0 → convertToNormal の宣言が無い');
            assert.ok((found.when ?? '').includes('editorLangId == markdown'), 'markdown 限定でない');
            assert.ok((found.when ?? '').includes('markdownInline.notionKeymap'), '設定で切れない');
        });

        it('Live: ⌘⇧0 に VS Code 本体の割り当てが反応しないよう noop を割り当てる（Live のときだけ・設定で切れる）', () => {
            const found = bindings.find((b) => b.command === 'markdownInline.noop' && sameKey(b.mac, 'cmd+shift+0'));
            assert.ok(found, '⌘⇧0 の noop 割り当てが無い');
            assert.ok((found.when ?? '').includes("activeCustomEditorId == 'ipreview.live'"), 'Live 限定でない');
            assert.ok((found.when ?? '').includes('markdownInline.notionKeymap'), '設定で切れない');
        });

        it('従来の ⌥⌘0 も残っている（既存の手癖を壊さない）', () => {
            const found = bindings.find((b) => b.command === 'markdownInline.convertToNormal' && sameKey(b.mac, 'alt+cmd+0'));
            assert.ok(found, '⌥⌘0 が消えている');
        });
    });

    describe('§3.1 Raw モード: 既定の上書き', () => {
        /**
         * 仕様 §1 の「Notion 準拠のキー」= インライン書式・ブロック変換・ブロック操作。
         * スマート移動や Tab インデント（`smart*` / `increaseIndent` / `toggleCheckbox` /
         * `toggleLive`）は Raw モード本来の機能で Notion 由来ではないため、
         * `notionKeymap.enabled` の対象外。
         */
        const NOTION_PREFIXES = [
            'markdownInline.format',
            'markdownInline.convertTo',
            'markdownInline.duplicateBlock',
            'markdownInline.moveLine'
        ];
        const notionKeys = bindings.filter((b) =>
            NOTION_PREFIXES.some((prefix) => b.command.startsWith(prefix))
        );

        it('Notion 準拠のキーが宣言されている', () => {
            assert.ok(notionKeys.length >= 20, `少なすぎる: ${notionKeys.length}`);
        });

        it('Notion 準拠のキーは markdown のときだけ効く', () => {
            const wrong = notionKeys
                .filter((b) => !(b.when ?? '').includes('editorLangId == markdown'))
                .map((b) => b.command);
            assert.deepStrictEqual(wrong, [], 'Markdown 以外でも効いてしまうキーがある');
        });

        it('Notion 準拠のキーは設定を切ると VS Code 既定へ戻る（when に notionKeymap を含む）', () => {
            const wrong = notionKeys
                .filter((b) => !(b.when ?? '').includes('markdownInline.notionKeymap'))
                .map((b) => `${b.command} (${b.mac ?? b.key ?? ''})`);
            assert.deepStrictEqual(wrong, []);
        });
    });
});
