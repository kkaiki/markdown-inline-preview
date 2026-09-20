/**
 * `.md` の既定エディタ（VS Code 本体の `workbench.editorAssociations`）との連動。
 *
 * customEditor の `priority: "default"` は拡張機能側の「希望」でしかなく、
 * 尊重しない環境がある（ユーザー報告 2026-09-12: Cursor では左サイドバーから
 * クリックすると素のテキストエディタが先に開き、そのあと Live へ切り替わって
 * Raw タブが閉じる＝ちらつく）。ユーザー設定である関連付けは拡張の宣言より強いので、
 * 設定 `markdownInline.live.controlDefaultEditor` が ON のあいだは既定モードへ
 * 追従させ、「開く前から解決先が1つに確定している」状態を作る。
 *
 * ファイルごとのモード記憶は関連付けでは表現できないため、記憶が既定と違うファイルは
 * `resolveCustomTextEditor` の跳ね返しで反対のモードへ開き直す（tabs-editors.test.ts）。
 */
import assert from 'assert';
import * as vscode from 'vscode';

const LIVE_VIEW_TYPE = 'ipreview.live';
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function associations(): Record<string, string> {
    return vscode.workspace.getConfiguration('workbench').get<Record<string, string>>('editorAssociations') ?? {};
}

async function setLive(key: string, value: unknown): Promise<void> {
    await vscode.workspace
        .getConfiguration('markdownInline')
        .update(key, value, vscode.ConfigurationTarget.Global);
    await wait(600);
}

suite('Live モード: .md の既定エディタとの連動（実 VS Code）', () => {
    suiteSetup(async () => {
        // このスイートは Markdown を開かないので、拡張機能を明示的に有効化しておく
        // （activationEvents は onLanguage:markdown / onCustomEditor のため）。
        await vscode.extensions.getExtension('markdown-inline-preview.markdown-inline-preview')?.activate();
        await wait(500);
    });

    teardown(async () => {
        await setLive('live.controlDefaultEditor', undefined);
        await setLive('live.defaultMode', undefined);
    });

    test('既定では *.md / *.markdown を Live のカスタムエディタへ関連付ける', async () => {
        await setLive('live.controlDefaultEditor', true);
        const assoc = associations();
        assert.strictEqual(assoc['*.md'], LIVE_VIEW_TYPE, JSON.stringify(assoc));
        assert.strictEqual(assoc['*.markdown'], LIVE_VIEW_TYPE, JSON.stringify(assoc));
    });

    test('既定モードを raw にすると標準テキストエディタへ向け直す', async () => {
        await setLive('live.controlDefaultEditor', true);
        await setLive('live.defaultMode', 'raw');
        const assoc = associations();
        assert.strictEqual(assoc['*.md'], 'default', JSON.stringify(assoc));
    });

    test('controlDefaultEditor を OFF にすると拡張が書いた関連付けを外す', async () => {
        await setLive('live.controlDefaultEditor', true);
        await setLive('live.controlDefaultEditor', false);
        const assoc = associations();
        assert.strictEqual(assoc['*.md'], undefined, JSON.stringify(assoc));
        assert.strictEqual(assoc['*.markdown'], undefined, JSON.stringify(assoc));
    });
});
