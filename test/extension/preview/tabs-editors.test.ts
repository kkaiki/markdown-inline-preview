/**
 * Preview モード（実 VS Code）のタブ・フォーカス管理を検証する。
 *
 * 対象: 複数ファイル間の Preview/Raw トグルでフォーカスが漂流しないこと、
 * CodeLens 経由の openPreview、openWith 二重実行によるタブ増殖防止、
 * markdown 以外のファイルでの no-op、サイドバー再オープンでのタブ重複防止。
 *
 * 実行: `node ./out-test/test/runTest.js`（VS Code を1回起動し、extension/ 配下の
 * 全テストファイルと同じインスタンス内で実行する）。`MOCHA_GREP` でテスト名の絞り込みが可能。
 */
import assert from "assert";
import * as vscode from "vscode";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { createTestDocument, closeAllEditors } from "../helpers";

const PREVIEW_VIEW_TYPE = 'ipreview.preview';

suite('Preview: tabs-editors', () => {

    teardown(async () => {
        await closeAllEditors();
    });

    suite('9. 複数ファイル Preview/Raw トグル', () => {

        function activeTabUri(): vscode.Uri | undefined {
            const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
            const input = tab?.input;
            if (input instanceof vscode.TabInputText) return input.uri;
            if (input instanceof vscode.TabInputCustom) return input.uri;
            return undefined;
        }

        function activeTabIsRawText(): boolean {
            return vscode.window.tabGroups.activeTabGroup.activeTab?.input instanceof vscode.TabInputText;
        }

        test('9.1 左のファイルをPreview→Rawに戻しても右のファイルへフォーカスが移動しない', async function () {
            this.timeout(30000);

            // このテストの目的はタブ・フォーカス管理であり untitled 固有の挙動ではないため、
            // ディスク実体を持つ実ファイルを使う（untitled は vscode.openWith がテキストタブを
            // 置き換えず2枚並存させる VS Code 側の挙動があり、この検証とは無関係な要因で
            // タブ判定が不安定になる。詳細: docs/specifications/untitled-preview-content-loss-fix.md）。
            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ipreview-9-1-'));
            async function openRealMdFile(name: string, content: string): Promise<vscode.TextDocument> {
                const filePath = path.join(tmpDir, name);
                fs.writeFileSync(filePath, content, 'utf-8');
                const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
                await vscode.window.showTextDocument(doc, { preview: false });
                return doc;
            }

            // ファイルA・B・Cを開き、すべてPreviewモードにする（開いた順に左からA, B, Cのタブになる）。
            const docA = await openRealMdFile('a.md', '# File A\n\nContent A');
            await vscode.commands.executeCommand('markdownInline.togglePreview');
            await new Promise(resolve => setTimeout(resolve, 300));

            const docB = await openRealMdFile('b.md', '# File B\n\nContent B');
            await vscode.commands.executeCommand('markdownInline.togglePreview');
            await new Promise(resolve => setTimeout(resolve, 300));

            await openRealMdFile('c.md', '# File C\n\nContent C');
            await vscode.commands.executeCommand('markdownInline.togglePreview');
            await new Promise(resolve => setTimeout(resolve, 300));

            // 何度か「左のタブ(A)へフォーカスを戻す → Raw に戻す → もう一度 Preview に戻す」を
            // 繰り返し、非同期処理のタイミング次第で右隣のタブへフォーカスが漂流しないか確認する。
            for (let i = 0; i < 5; i++) {
                // Aの Preview タブへ確実にフォーカスを移す（vscode.openWith は URI を明示するため、
                // インデックス依存のコマンドよりも対象の取り違えが起きない）。
                await vscode.commands.executeCommand('vscode.openWith', docA.uri, PREVIEW_VIEW_TYPE, vscode.ViewColumn.Active);
                assert.strictEqual(
                    activeTabUri()?.toString(),
                    docA.uri.toString(),
                    `[iteration ${i}] 前提条件: Aの Preview タブがアクティブになっていません（アクティブタブ: ${activeTabUri()?.toString()}）`
                );

                // 実際のユーザー操作を模し、意図的な待機を入れずに直後にRaw切り替えを実行する。
                await vscode.commands.executeCommand('markdownInline.togglePreview');
                await new Promise(resolve => setTimeout(resolve, 400));

                assert.ok(
                    activeTabIsRawText(),
                    `[iteration ${i}] Rawへの切り替え後、アクティブタブがテキストエディタになっていません（アクティブタブ: ${activeTabUri()?.toString()}）`
                );
                assert.strictEqual(
                    activeTabUri()?.toString(),
                    docA.uri.toString(),
                    `[iteration ${i}] Aを Raw に戻したのに、他のファイル(アクティブタブ: ${activeTabUri()?.toString()}, B=${docB.uri.toString()})へフォーカスが移動しました`
                );

                // 次のイテレーションのためにAをPreviewへ戻す。
                await vscode.commands.executeCommand('markdownInline.togglePreview');
                await new Promise(resolve => setTimeout(resolve, 300));
            }

            fs.rmSync(tmpDir, { recursive: true, force: true });
        });

        test('9.2 他ファイルが既にPreview中でも、CodeLens(openPreview)で今のRawファイルをPreviewにできる', async function () {
            this.timeout(15000);

            // ファイルAをPreviewにしておく（他ファイルのPreviewが既に存在する状態を作る）。
            const editorA = await createTestDocument('# File A\n\nContent A');
            const docA = editorA.document;
            await vscode.commands.executeCommand('markdownInline.togglePreview');
            await new Promise(resolve => setTimeout(resolve, 300));

            // ファイルBをRawで開き、アクティブにする。
            const editorB = await createTestDocument('# File B\n\nContent B');
            const docB = editorB.document;
            assert.ok(
                activeTabIsRawText(),
                `前提条件: Bのタブがテキストエディタになっていません（アクティブタブ: ${activeTabUri()?.toString()}）`
            );

            // CodeLens の Preview 項目が呼ぶのと同じコマンド（タイトルバーのアイコンは
            // togglePreview に統一されたため、こちらは openPreview 単体の直接呼び出し経路）。
            await vscode.commands.executeCommand('markdownInline.openPreview');
            await new Promise(resolve => setTimeout(resolve, 400));

            assert.strictEqual(
                activeTabUri()?.toString(),
                docB.uri.toString(),
                `Aが既にPreview中のため、Bをopen PreviewしてもBがPreviewになりませんでした（アクティブタブ: ${activeTabUri()?.toString()}, A=${docA.uri.toString()}）`
            );
            assert.ok(
                !activeTabIsRawText(),
                'Bのアクティブタブがまだテキストエディタのままです（Previewに切り替わっていません）'
            );
        });

        test('9.3 3ファイルすべてPreview中に真ん中のファイルだけRawへ戻しても、両隣のPreviewタブは維持される', async function () {
            this.timeout(30000);

            // 9.1 は常に左端(A)を操作対象にしていたが、ここでは真ん中(B)を操作し、
            // 「両隣が Preview のまま」という 9.1 とは異なる前提条件で回帰を防ぐ。
            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ipreview-9-3-'));
            try {
                async function openRealMdFile(name: string, content: string): Promise<vscode.TextDocument> {
                    const filePath = path.join(tmpDir, name);
                    fs.writeFileSync(filePath, content, 'utf-8');
                    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
                    await vscode.window.showTextDocument(doc, { preview: false });
                    return doc;
                }

                const docA = await openRealMdFile('a.md', '# File A\n\nContent A');
                await vscode.commands.executeCommand('markdownInline.togglePreview');
                await new Promise(resolve => setTimeout(resolve, 300));

                const docB = await openRealMdFile('b.md', '# File B\n\nContent B');
                await vscode.commands.executeCommand('markdownInline.togglePreview');
                await new Promise(resolve => setTimeout(resolve, 300));

                const docC = await openRealMdFile('c.md', '# File C\n\nContent C');
                await vscode.commands.executeCommand('markdownInline.togglePreview');
                await new Promise(resolve => setTimeout(resolve, 300));

                // 真ん中(B)のPreviewタブへ明示的にフォーカスしてRawへ戻す。
                await vscode.commands.executeCommand('vscode.openWith', docB.uri, PREVIEW_VIEW_TYPE, vscode.ViewColumn.Active);
                await new Promise(resolve => setTimeout(resolve, 300));
                assert.strictEqual(
                    activeTabUri()?.toString(), docB.uri.toString(),
                    `前提条件: Bの Preview タブがアクティブになっていません（アクティブタブ: ${activeTabUri()?.toString()}）`
                );

                await vscode.commands.executeCommand('markdownInline.togglePreview');
                await new Promise(resolve => setTimeout(resolve, 400));

                assert.ok(
                    activeTabIsRawText(),
                    `Bを Raw に戻したのにアクティブタブがテキストエディタになっていません（アクティブタブ: ${activeTabUri()?.toString()}）`
                );
                assert.strictEqual(
                    activeTabUri()?.toString(), docB.uri.toString(),
                    `Bを Raw に戻したら別ファイルへフォーカスが移動しました（アクティブタブ: ${activeTabUri()?.toString()}）`
                );

                // 両隣(A・C)がPreviewタブのまま残っていることを確認する。
                function isPreviewTabFor(uri: vscode.Uri): boolean {
                    for (const group of vscode.window.tabGroups.all) {
                        for (const tab of group.tabs) {
                            if (tab.input instanceof vscode.TabInputCustom
                                && tab.input.viewType === PREVIEW_VIEW_TYPE
                                && tab.input.uri.toString() === uri.toString()) {
                                return true;
                            }
                        }
                    }
                    return false;
                }
                assert.ok(isPreviewTabFor(docA.uri), 'Bを Raw に戻したら左隣(A)のPreviewタブが失われました');
                assert.ok(isPreviewTabFor(docC.uri), 'Bを Raw に戻したら右隣(C)のPreviewタブが失われました');
            } finally {
                fs.rmSync(tmpDir, { recursive: true, force: true });
            }
        });
    });

    suite('12. Preview 実利用フロー（実 VS Code でのタブ・保存・外部編集）', () => {
        // 実際のユーザーが Preview を使うときの典型的な流れ（開く→切り替える→外部ツールが
        // 触る→戻る）を、実ファイル + 実 VS Code タブで検証する。このスイートのうち
        // タブ管理（増殖しない・no-op になる）だけをここに置き、内容同期の観点は
        // external-sync.test.ts（12.1/12.2/12.3/12.6）が担当する。
        let tmpDir: string | undefined;

        teardown(() => {
            if (tmpDir) {
                fs.rmSync(tmpDir, { recursive: true, force: true });
                tmpDir = undefined;
            }
        });

        function sleep(ms: number): Promise<void> {
            return new Promise(resolve => setTimeout(resolve, ms));
        }

        async function openRealFile(content: string): Promise<{ editor: vscode.TextEditor; filePath: string }> {
            tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ipreview-usage-test-'));
            const filePath = path.join(tmpDir, 'doc.md');
            fs.writeFileSync(filePath, content, 'utf-8');
            const uri = vscode.Uri.file(filePath);
            const doc = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(doc);
            // 直前のテストが Preview モードを「記憶」させていると、新規オープンのファイルは
            // 自動的に Preview へ切り替わる（モード記憶機能の正しい動作）。その場合、上で
            // 取得した TextEditor ハンドルが破棄されて後続の editor.edit が Illegal argument に
            // なる。このスイートは「Raw から始まる」前提なので、自動切替が遅れて発動しても
            // Raw に落ち着くまで明示的に Raw を強制し続ける。
            for (let i = 0; i < 10; i++) {
                await sleep(400);
                if (previewTabsForUri(uri).length === 0
                    && vscode.window.tabGroups.activeTabGroup.activeTab?.input instanceof vscode.TabInputText) {
                    break;
                }
                await vscode.commands.executeCommand('vscode.openWith', uri, 'default', vscode.ViewColumn.Active);
            }
            const editor = await vscode.window.showTextDocument(doc);
            assert.ok(
                vscode.window.tabGroups.activeTabGroup.activeTab?.input instanceof vscode.TabInputText,
                '前提条件: Raw（テキストエディタ）で開けていない'
            );
            return { editor, filePath };
        }

        function activeTab(): vscode.Tab | undefined {
            return vscode.window.tabGroups.activeTabGroup.activeTab;
        }

        function activeTabUri(): vscode.Uri | undefined {
            const input = activeTab()?.input;
            if (input instanceof vscode.TabInputText) return input.uri;
            if (input instanceof vscode.TabInputCustom) return input.uri;
            return undefined;
        }

        function previewTabsForUri(uri: vscode.Uri): vscode.Tab[] {
            const tabs: vscode.Tab[] = [];
            for (const group of vscode.window.tabGroups.all) {
                for (const tab of group.tabs) {
                    if (tab.input instanceof vscode.TabInputCustom
                        && tab.input.viewType === PREVIEW_VIEW_TYPE
                        && tab.input.uri.toString() === uri.toString()) {
                        tabs.push(tab);
                    }
                }
            }
            return tabs;
        }

        test('12.4 同じファイルへ openWith を2回実行しても Preview タブは1枚のまま増殖しない', async function () {
            this.timeout(20000);

            const { editor } = await openRealFile('# タブ増殖チェック\n');
            const uri = editor.document.uri;

            await vscode.commands.executeCommand('vscode.openWith', uri, PREVIEW_VIEW_TYPE, vscode.ViewColumn.Active);
            await sleep(500);
            await vscode.commands.executeCommand('vscode.openWith', uri, PREVIEW_VIEW_TYPE, vscode.ViewColumn.Active);
            await sleep(500);

            assert.strictEqual(previewTabsForUri(uri).length, 1,
                `同一 URI の Preview タブが増殖した（${previewTabsForUri(uri).length} 枚）`);
        });

        test('12.5 markdown 以外のファイルで togglePreview を実行してもエラーにならず、タブはテキストのまま', async function () {
            this.timeout(15000);

            const doc = await vscode.workspace.openTextDocument({ content: 'plain text', language: 'plaintext' });
            await vscode.window.showTextDocument(doc);

            await vscode.commands.executeCommand('markdownInline.togglePreview');
            await sleep(500);

            assert.ok(activeTab()?.input instanceof vscode.TabInputText,
                `markdown 以外なのにタブが Preview 化された（アクティブタブ: ${activeTabUri()?.toString()}）`);
            assert.strictEqual(vscode.window.activeTextEditor?.document.getText(), 'plain text',
                'markdown 以外のファイル内容が変化した');
        });
    });

    suite('13. サイドバー（Explorer）からの再オープンで Preview タブが重複しない', () => {
        // 既に Preview で開いているファイルを、左のサイドバー（Explorer）から
        // もう一度開くと、customEditor の priority が "option"（既定は Raw）
        // であるために新しい Raw タブが同じグループに追加され、Preview と
        // Raw の2枚タブになってしまう不具合の回帰テスト。
        // 同じグループ内での重複だけを解消対象とし、意図的に別のエディタ
        // グループ（右側など）に開いた場合は統一しない。
        let tmpDir: string | undefined;

        teardown(() => {
            if (tmpDir) {
                fs.rmSync(tmpDir, { recursive: true, force: true });
                tmpDir = undefined;
            }
        });

        function sleep(ms: number): Promise<void> {
            return new Promise(resolve => setTimeout(resolve, ms));
        }

        function allTabsForUri(uri: vscode.Uri): vscode.Tab[] {
            const tabs: vscode.Tab[] = [];
            for (const group of vscode.window.tabGroups.all) {
                for (const tab of group.tabs) {
                    const input = tab.input;
                    if (input instanceof vscode.TabInputText && input.uri.toString() === uri.toString()) {
                        tabs.push(tab);
                    } else if (input instanceof vscode.TabInputCustom
                        && input.viewType === PREVIEW_VIEW_TYPE
                        && input.uri.toString() === uri.toString()) {
                        tabs.push(tab);
                    }
                }
            }
            return tabs;
        }

        async function createRealMdFile(name: string, content: string): Promise<vscode.Uri> {
            if (!tmpDir) tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ipreview-13-'));
            const filePath = path.join(tmpDir, name);
            await fs.promises.writeFile(filePath, content, 'utf-8');
            return vscode.Uri.file(filePath);
        }

        test('13.1 同じグループでPreview中のファイルをサイドバーから再度開いても、Rawタブが重複せずPreviewだけが残る', async function () {
            this.timeout(20000);

            const uri = await createRealMdFile('dup.md', '# 重複チェック\n');
            const doc = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.One, preview: false });

            await vscode.commands.executeCommand('markdownInline.togglePreview');
            await sleep(600);
            assert.strictEqual(allTabsForUri(uri).length, 1, '前提条件: Previewタブが1枚開いていない');
            assert.strictEqual(
                (vscode.window.tabGroups.activeTabGroup.activeTab?.input as vscode.TabInputCustom | undefined)?.viewType,
                PREVIEW_VIEW_TYPE,
                '前提条件: アクティブタブがPreviewになっていない'
            );

            // サイドバー（Explorer）からの再オープンを模す。customEditor は
            // priority: "option" のため、既定では Raw（テキストエディタ）で開かれる。
            await vscode.commands.executeCommand('vscode.open', uri, vscode.ViewColumn.One);
            await sleep(800);

            const tabs = allTabsForUri(uri);
            assert.strictEqual(tabs.length, 1,
                `同じファイルを再度開いたら Raw タブが重複して増えた（${tabs.length} 枚）`);
            assert.ok(
                tabs[0].input instanceof vscode.TabInputCustom && tabs[0].input.viewType === PREVIEW_VIEW_TYPE,
                '重複解消後に残ったタブが Preview になっていない'
            );
        });

        test('13.2 別のビューカラム（右側）に同じファイルを開く場合はPreviewと統一されず両方開いたままになる', async function () {
            this.timeout(20000);

            const uri = await createRealMdFile('dup2.md', '# 別カラムは統一しない\n');
            const doc = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.One, preview: false });

            await vscode.commands.executeCommand('markdownInline.togglePreview');
            await sleep(600);
            assert.strictEqual(allTabsForUri(uri).length, 1, '前提条件: Previewタブが1枚開いていない');

            // 右側（別のエディタグループ）に同じファイルを開く。
            await vscode.commands.executeCommand('vscode.open', uri, vscode.ViewColumn.Two);
            await sleep(800);

            const tabs = allTabsForUri(uri);
            assert.strictEqual(tabs.length, 2,
                `別カラムで開いたのに Preview 側と統一されて1枚になってしまった（${tabs.length} 枚）`);
            const hasPreview = tabs.some(t => t.input instanceof vscode.TabInputCustom && t.input.viewType === PREVIEW_VIEW_TYPE);
            const hasRaw = tabs.some(t => t.input instanceof vscode.TabInputText);
            assert.ok(hasPreview && hasRaw, '左にPreview・右にRawの2枚構成になっていない');
        });
    });
});
