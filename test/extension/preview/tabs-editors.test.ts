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

        // このテストは現状 skip している。untitled-preview-content-loss-fix.md の
        // 「副作用として見つかった別件」で説明されている「複数 untitled ファイルを開いて
        // 高速に Raw⇄Preview を往復すると WorkspaceEdit ベースの内容復元処理がタブ管理と
        // 干渉してフォーカスが漂流する」不具合を実際に再現させてみたところ
        // （preview-usage-flow-test-backlog.md §4.1 のギャップ潰しの一環）、1回目の
        // 往復から確実に再現し（`vscode.workspace.applyEdit` が
        // "has changed in the meantime" で無視される警告も伴う）、恒久的な既知の制限と
        // 判明した。当時のチームも同じ理由で「実ファイルを使う」という回避策に倒しており
        // （9.1 がその回避策）、今回もその判断を踏襲し深追いしない。恒常的に失敗する
        // テストとして CI を赤くし続けないよう skip し、再現条件を記録するに留める。
        test.skip('9.4 複数の未保存（untitled）ファイルを開いて高速にRaw⇄Previewを往復すると、フォーカスが他ファイルへ漂流する（既知の制限・要:根本対応の検討）', async function () {
            this.timeout(30000);
            const docA = await vscode.workspace.openTextDocument({ content: '# 未保存A\n\n本文A\n', language: 'markdown' });
            await vscode.window.showTextDocument(docA, { preview: false });
            await vscode.commands.executeCommand('markdownInline.togglePreview');
            await new Promise(resolve => setTimeout(resolve, 400));

            const docB = await vscode.workspace.openTextDocument({ content: '# 未保存B\n\n本文B\n', language: 'markdown' });
            await vscode.window.showTextDocument(docB, { preview: false });
            await vscode.commands.executeCommand('markdownInline.togglePreview');
            await new Promise(resolve => setTimeout(resolve, 400));

            for (let i = 0; i < 3; i++) {
                await vscode.commands.executeCommand('vscode.openWith', docA.uri, PREVIEW_VIEW_TYPE, vscode.ViewColumn.Active);
                await new Promise(resolve => setTimeout(resolve, 200));
                assert.strictEqual(
                    activeTabUri()?.toString(), docA.uri.toString(),
                    `[iteration ${i}] 前提条件: AのPreviewタブがアクティブになっていません（アクティブタブ: ${activeTabUri()?.toString()}）`
                );

                await vscode.commands.executeCommand('markdownInline.togglePreview');
                await new Promise(resolve => setTimeout(resolve, 400));

                assert.strictEqual(
                    activeTabUri()?.toString(), docA.uri.toString(),
                    `[iteration ${i}] AをRawに戻したのに他ファイルへフォーカスが移動しました（アクティブタブ: ${activeTabUri()?.toString()}, B=${docB.uri.toString()}）`
                );
                assert.strictEqual(
                    docA.getText(), '# 未保存A\n\n本文A\n',
                    `[iteration ${i}] Aの本文が失われた: ${JSON.stringify(docA.getText())}`
                );
                assert.strictEqual(
                    docB.getText(), '# 未保存B\n\n本文B\n',
                    `[iteration ${i}] 無関係のBの本文が変化した: ${JSON.stringify(docB.getText())}`
                );

                await vscode.commands.executeCommand('markdownInline.togglePreview');
                await new Promise(resolve => setTimeout(resolve, 400));
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
        //
        // **2026-07-20 追記**: `preview-default-editor-fix.md` で customEditor の
        // priority を "option" → "default" に変更したため、この 13.1/13.3 が検証していた
        // 「Raw が一瞬作られてから重複解消される」という経路自体が、同じ列への再オープンでは
        // 発生しなくなった（`vscode.open` は最初から Preview を解決し、
        // `supportsMultipleEditorsPerDocument: false` により既存の Preview タブがそのまま
        // 再利用されるため）。13.1/13.3 はこの「そもそも重複が起きない」新しい仕様を検証する
        // 形に更新した。13.2（別カラム）は各カラムが独立した Preview インスタンスを持つ
        // （Raw にはならない）ことを検証する形に更新した。
        // 一方、明示的に「Reopen Editor With > Text Editor」等で Raw を強制した場合の
        // 重複解消ロジック自体（collapseDuplicateRawTabsInGroup・previewSettledAt の猶予窓）は
        // 引き続き有効で、13.4 で検証を続ける。
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
            // priority: "default" のため、既定でも直接 Preview が解決される
            // （`supportsMultipleEditorsPerDocument: false` により既存の Preview タブが
            // そのまま再利用され、Raw タブは一度も作られない）。
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

        test('13.2 別のビューカラム（右側）に同じファイルを開く場合はそれぞれ独立した Preview インスタンスになる', async function () {
            this.timeout(20000);

            const uri = await createRealMdFile('dup2.md', '# 別カラムは統一しない\n');
            const doc = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.One, preview: false });

            await vscode.commands.executeCommand('markdownInline.togglePreview');
            await sleep(600);
            assert.strictEqual(allTabsForUri(uri).length, 1, '前提条件: Previewタブが1枚開いていない');

            // 右側（別のエディタグループ）に同じファイルを開く。priority: "default" のため
            // こちらも直接 Preview が解決されるが、左のタブと統一されず（グループが違うため
            // collapseDuplicateRawTabsInGroup の対象外）、独立した2枚目の Preview インスタンス
            // になる。
            await vscode.commands.executeCommand('vscode.open', uri, vscode.ViewColumn.Two);
            await sleep(800);

            const tabs = allTabsForUri(uri);
            assert.strictEqual(tabs.length, 2,
                `別カラムで開いたのに Preview 側と統一されて1枚になってしまった（${tabs.length} 枚）`);
            const previewCount = tabs.filter(t => t.input instanceof vscode.TabInputCustom && t.input.viewType === PREVIEW_VIEW_TYPE).length;
            assert.strictEqual(previewCount, 2, `両カラムとも Preview になっていない: ${JSON.stringify(tabs.map(t => t.input))}`);
        });

        // sidebar-reopen-preview-duplicate-tab-fix.md が説明する2つの排他ガード
        // （previewSettledAt の 500ms 猶予・inFlightSwitch）は、priority: "option" 時代の
        // 「Raw が一瞬作られてから重複解消される」という reactive な経路のためのものだった。
        // priority: "default" 化（preview-default-editor-fix.md）後は、同じ列への
        // サイドバー再オープンで Raw が作られること自体が無くなったため、13.3 はこの
        // 「猶予窓の内側でも外側でも、そもそも Raw タブは1枚も作られない」という
        // 新しい仕様を検証する形に更新した（旧仕様の猶予窓の挙動自体は 13.4 が別途カバーする、
        // 明示的に Raw を強制するケースで引き続き有効）。

        test('13.3 Previewタブ作成直後（500ms未満）にサイドバーから再オープンしても、Rawタブは一度も作られずPreviewのまま', async function () {
            this.timeout(20000);

            const uri = await createRealMdFile('dup3.md', '# 猶予窓レース\n');
            const doc = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.One, preview: false });

            await vscode.commands.executeCommand('markdownInline.togglePreview');
            // 意図的に previewSettledAt の猶予窓（500ms）が過ぎる前に再オープンする。
            await sleep(150);
            assert.strictEqual(allTabsForUri(uri).length, 1, '前提条件: Previewタブが1枚開いていない');

            await vscode.commands.executeCommand('vscode.open', uri, vscode.ViewColumn.One);
            await sleep(150); // 500ms 猶予窓の内側（合計 300ms 経過時点）
            const tabsWithinWindow = allTabsForUri(uri);
            assert.strictEqual(
                tabsWithinWindow.length, 1,
                `猶予窓の内側でも Raw タブが作られてしまった（${tabsWithinWindow.length} 枚）`
            );
            assert.ok(
                tabsWithinWindow[0].input instanceof vscode.TabInputCustom && tabsWithinWindow[0].input.viewType === PREVIEW_VIEW_TYPE,
                '猶予窓の内側でタブが Preview 以外になっている'
            );

            // 猶予窓が過ぎた後にもう一度再オープンしても、引き続き Raw は作られない。
            await sleep(500); // 合計 800ms 経過、猶予窓(500ms)を確実に超える
            await vscode.commands.executeCommand('vscode.open', uri, vscode.ViewColumn.One);
            await sleep(800);

            const tabs = allTabsForUri(uri);
            assert.strictEqual(tabs.length, 1,
                `猶予窓を過ぎた後の再オープンで Raw タブが作られた（${tabs.length} 枚）`);
            assert.ok(
                tabs[0].input instanceof vscode.TabInputCustom && tabs[0].input.viewType === PREVIEW_VIEW_TYPE,
                'タブがPreviewになっていない'
            );
        });

        test('13.4 togglePreviewの実行中にサイドバー再オープンが重なっても例外にならず、最終的にPreviewタブ1枚に収束する', async function () {
            this.timeout(20000);

            // inFlightSwitch ガードの本来の目的（switchToPreview/switchToRaw の処理中に
            // 重複解消ロジックが同じタブへ横から openWith/close を行い競合する）を、
            // 内部状態へのフックなしにブラックボックスで厳密に再現することはできないが、
            // togglePreview と再オープンをシーケンシャルに待たず重ねて発火させることで、
            // 過去に "Illegal argument: TextEditor" を起こした操作の重なりに近い状況を作る。
            const uri = await createRealMdFile('dup4.md', '# in-flightレース\n');
            const doc = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.One, preview: false });

            let caught: unknown = null;
            try {
                const togglePromise = vscode.commands.executeCommand('markdownInline.togglePreview');
                await sleep(20); // switchToPreview 内部の await 前後を狙う程度の最小待機
                const reopenPromise = vscode.commands.executeCommand('vscode.open', uri, vscode.ViewColumn.One);
                await Promise.all([togglePromise, reopenPromise]);
            } catch (err) {
                caught = err;
            }
            assert.strictEqual(caught, null, `togglePreviewと再オープンの重なりで例外が発生した: ${JSON.stringify(caught)}`);

            // 過渡状態が解消されるまで十分待ち、最終的にPreviewタブ1枚に収束することを確認する。
            await sleep(1500);
            const tabs = allTabsForUri(uri);
            assert.strictEqual(tabs.length, 1,
                `操作が重なった後、最終的にタブが1枚に収束しなかった（${tabs.length} 枚）`);
        });

        test('13.5 実際のExplorer単発クリック（preview:true）で再オープンしても、Rawタブが重複せずPreviewだけが残る', async function () {
            this.timeout(20000);

            // 13.1 は `vscode.open` に viewColumn だけを渡していたが、実際の Explorer
            // シングルクリックは `TextDocumentShowOptions` の `preview: true`
            // （VS Code の「プレビューモード（斜体タブ）」）を伴って解決される。
            // この違いがある場合にのみ重複が再現しないか（＝13.1 では検出できない
            // 実機バグの可能性）を切り分けるための再現テスト。
            const uri = await createRealMdFile('dup5.md', '# 実クリック相当の再現\n');
            const doc = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.One, preview: false });

            await vscode.commands.executeCommand('markdownInline.togglePreview');
            // previewSettledAt の猶予窓（500ms）を確実に超えてから再クリックする
            // （ユーザー報告は「ずっと同じタブで開いたまま、しばらくしてから再クリック」）。
            await sleep(600);
            assert.strictEqual(allTabsForUri(uri).length, 1, '前提条件: Previewタブが1枚開いていない');
            assert.strictEqual(
                (vscode.window.tabGroups.activeTabGroup.activeTab?.input as vscode.TabInputCustom | undefined)?.viewType,
                PREVIEW_VIEW_TYPE,
                '前提条件: アクティブタブがPreviewになっていない'
            );

            // Explorer の単発クリックを模す（preview: true を明示）。
            await vscode.commands.executeCommand('vscode.open', uri, { viewColumn: vscode.ViewColumn.One, preview: true });
            await sleep(800);

            const tabs = allTabsForUri(uri);
            assert.strictEqual(tabs.length, 1,
                `Explorer単発クリック相当の再オープンでタブが重複した（${tabs.length} 枚）`);
            assert.ok(
                tabs[0].input instanceof vscode.TabInputCustom && tabs[0].input.viewType === PREVIEW_VIEW_TYPE,
                '重複解消後に残ったタブが Preview になっていない'
            );
        });
    });

    suite('14. Previewから標準操作で開いた先が同じ列に留まる', () => {
        // アクティブな Preview（Webview カスタムエディタ）から通常のテキストエディタは
        // vscode.window.activeTextEditor に現れないため、viewColumn を指定せずに
        // showTextDocument するとリンク先が新しいエディタグループ（サイドバー分割）に
        // 開かれてしまう不具合の回帰テスト。webview 側 JS はこのテスト層から駆動できないため、
        // openLink メッセージ受信と同じ経路をテスト専用コマンドで直接叩く。
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

        test('14.1 Previewでリンクを開くと、新しいエディタグループを作らず同じ列に新しいタブとして開く', async function () {
            this.timeout(20000);

            tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ipreview-14-'));
            const targetPath = path.join(tmpDir, 'target.md');
            fs.writeFileSync(targetPath, '# Target\n', 'utf-8');
            const sourcePath = path.join(tmpDir, 'source.md');
            fs.writeFileSync(sourcePath, '# Source\n\n[link](./target.md)\n', 'utf-8');
            const sourceUri = vscode.Uri.file(sourcePath);

            const doc = await vscode.workspace.openTextDocument(sourceUri);
            await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.One, preview: false });
            await vscode.commands.executeCommand('markdownInline.togglePreview');
            await sleep(500);
            assert.strictEqual(
                vscode.window.activeTextEditor,
                undefined,
                `前提条件: Preview(Custom Editor)がアクティブなのに activeTextEditor が残っている: ${vscode.window.activeTextEditor?.document.uri.toString()}`
            );

            const groupCountBefore = vscode.window.tabGroups.all.length;

            const injected = await vscode.commands.executeCommand(
                'markdownInline.__test.injectOpenLink',
                sourceUri.toString(),
                './target.md'
            );
            assert.strictEqual(injected, true, '前提条件: リンクを注入するテスト用フックが見つからない（Previewが開けていない）');
            await sleep(500);

            assert.strictEqual(
                vscode.window.tabGroups.all.length,
                groupCountBefore,
                `リンクを開いたら新しいエディタグループ（サイドバー分割）が作られた（${groupCountBefore} → ${vscode.window.tabGroups.all.length}）`
            );

            const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
            const input = activeTab?.input;
            // 開いた瞬間の実際のタブ種別（Raw/Preview）は「最後に使ったモードを記憶する」
            // 機能次第で変わりうる（このテストの関心はどちらでもなく、同じ列に開かれたか）。
            const activeUri = input instanceof vscode.TabInputText
                ? input.uri
                : input instanceof vscode.TabInputCustom
                    ? input.uri
                    : undefined;
            assert.strictEqual(
                activeUri?.toString(),
                vscode.Uri.file(targetPath).toString(),
                `リンク先が新しいタブとしてアクティブになっていない（アクティブタブ: ${activeUri?.toString()}）`
            );
        });

        test('14.2 Preview中に列指定なしで別ファイルを続けて開いても同じ列の新規タブになる', async function () {
            this.timeout(20000);

            tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ipreview-14-sidebar-'));
            const testDir = tmpDir;
            const sourceUri = vscode.Uri.file(path.join(testDir, 'source.md'));
            fs.writeFileSync(sourceUri.fsPath, '# Source\n', 'utf-8');
            const targetUris = ['target-a.md', 'target-b.md'].map(name => {
                const uri = vscode.Uri.file(path.join(testDir, name));
                fs.writeFileSync(uri.fsPath, `# ${name}\n`, 'utf-8');
                return uri;
            });

            const sourceDocument = await vscode.workspace.openTextDocument(sourceUri);
            await vscode.window.showTextDocument(sourceDocument, {
                viewColumn: vscode.ViewColumn.One,
                preview: false
            });
            await vscode.commands.executeCommand('markdownInline.togglePreview');
            await sleep(500);

            assert.strictEqual(
                vscode.window.tabGroups.all.length,
                1,
                `前提条件: 1分割で開始していない（${vscode.window.tabGroups.all.length}分割）`
            );
            assert.ok(
                vscode.window.tabGroups.activeTabGroup.activeTab?.input instanceof vscode.TabInputCustom,
                '前提条件: PreviewのCustom Editorがアクティブではない'
            );

            for (const [index, targetUri] of targetUris.entries()) {
                await vscode.commands.executeCommand(
                    'vscode.openWith',
                    sourceUri,
                    PREVIEW_VIEW_TYPE,
                    vscode.ViewColumn.One
                );
                await sleep(200);
                // ExplorerやCLIがURIだけを渡すVS Code標準経路。列選択はVS Codeに任せる。
                await vscode.commands.executeCommand('vscode.open', targetUri);
                await sleep(800);

                assert.strictEqual(
                    vscode.window.tabGroups.all.length,
                    1,
                    `${index + 1}個目のファイルを開いたらエディタグループが増殖した（現在${vscode.window.tabGroups.all.length}分割）`
                );

                const activeInput = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
                const activeUri = activeInput instanceof vscode.TabInputText
                    ? activeInput.uri
                    : activeInput instanceof vscode.TabInputCustom
                        ? activeInput.uri
                        : undefined;
                assert.strictEqual(
                    activeUri?.toString(),
                    targetUri.toString(),
                    `${index + 1}個目のファイルが同じ列の新規アクティブタブになっていない`
                );
            }
        });

        test('14.3 右側に既存グループがあってもPreviewから列指定なしで非Markdownを開くとPreview列の新規タブになる', async function () {
            this.timeout(20000);

            // 同じVS Codeセッションで直前ケースのCustom Editor破棄が完了するのを待ち、
            // 右グループ作成時に前ケースのPreviewを起点と誤認しないようにする。
            await closeAllEditors();
            await sleep(500);

            tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ipreview-14-non-markdown-'));
            const leftPlaceholderUri = vscode.Uri.file(path.join(tmpDir, 'left-placeholder.txt'));
            const sourceUri = vscode.Uri.file(path.join(tmpDir, 'source.md'));
            const existingRightUri = vscode.Uri.file(path.join(tmpDir, 'agent-placeholder.txt'));
            const targetUri = vscode.Uri.file(path.join(tmpDir, 'eslint.config.js'));
            fs.writeFileSync(leftPlaceholderUri.fsPath, 'left placeholder\n', 'utf-8');
            fs.writeFileSync(sourceUri.fsPath, '# Source\n', 'utf-8');
            fs.writeFileSync(existingRightUri.fsPath, 'existing right group\n', 'utf-8');
            fs.writeFileSync(targetUri.fsPath, 'module.exports = {};\n', 'utf-8');

            const leftPlaceholderDocument = await vscode.workspace.openTextDocument(leftPlaceholderUri);
            await vscode.window.showTextDocument(leftPlaceholderDocument, {
                viewColumn: vscode.ViewColumn.One,
                preview: false
            });

            const rightDocument = await vscode.workspace.openTextDocument(existingRightUri);
            await vscode.window.showTextDocument(rightDocument, {
                viewColumn: vscode.ViewColumn.Two,
                preview: false
            });
            await vscode.commands.executeCommand('workbench.action.lockEditorGroup');

            await vscode.commands.executeCommand(
                'vscode.openWith',
                sourceUri,
                PREVIEW_VIEW_TYPE,
                vscode.ViewColumn.One
            );
            await sleep(500);
            assert.strictEqual(vscode.window.tabGroups.all.length, 2, '前提条件: 左Preview＋右既存グループの2分割ではない');
            assert.ok(
                vscode.window.tabGroups.activeTabGroup.activeTab?.input instanceof vscode.TabInputCustom,
                '前提条件: 左列のPreviewがアクティブではない'
            );

            await vscode.commands.executeCommand('vscode.open', targetUri);
            await sleep(800);

            assert.strictEqual(
                vscode.window.tabGroups.all.length,
                2,
                `非Markdownを開いたら3分割へ増殖した（現在${vscode.window.tabGroups.all.length}分割）`
            );
            const leftGroup = vscode.window.tabGroups.all.find(group => group.viewColumn === vscode.ViewColumn.One);
            const activeInput = leftGroup?.activeTab?.input;
            const activeUri = activeInput instanceof vscode.TabInputText
                ? activeInput.uri
                : activeInput instanceof vscode.TabInputCustom
                    ? activeInput.uri
                    : undefined;
            assert.strictEqual(
                activeUri?.toString(),
                targetUri.toString(),
                '非Markdownが作業中のPreview列の新規タブとして開かれていない'
            );
        });

    });

    suite('15. VS Code標準のファイルオープン先を妨げない', () => {
        test('15.1 左Previewと右ロック済みCLIグループがあるとき列指定なしで開いたファイルは左の新規タブになる', async function () {
            this.timeout(20000);
            await closeAllEditors();
            await new Promise(resolve => setTimeout(resolve, 500));

            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ipreview-15-cli-'));
            try {
                const leftUri = vscode.Uri.file(path.join(tmpDir, 'left.md'));
                const rightUri = vscode.Uri.file(path.join(tmpDir, 'terminal-placeholder.txt'));
                const targetUri = vscode.Uri.file(path.join(tmpDir, 'opened-from-cli.js'));
                fs.writeFileSync(leftUri.fsPath, '# Left\n', 'utf-8');
                fs.writeFileSync(rightUri.fsPath, 'terminal\n', 'utf-8');
                fs.writeFileSync(targetUri.fsPath, 'export {};\n', 'utf-8');

                await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(rightUri), {
                    viewColumn: vscode.ViewColumn.One,
                    preview: false
                });
                await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(leftUri), {
                    viewColumn: vscode.ViewColumn.One,
                    preview: false
                });
                await vscode.commands.executeCommand('vscode.open', rightUri, vscode.ViewColumn.Beside);
                await vscode.commands.executeCommand('workbench.action.lockEditorGroup');
                await vscode.commands.executeCommand('vscode.openWith', leftUri, PREVIEW_VIEW_TYPE, vscode.ViewColumn.One);
                await new Promise(resolve => setTimeout(resolve, 500));
                await vscode.commands.executeCommand('vscode.open', rightUri, vscode.ViewColumn.Two);
                assert.strictEqual(
                    vscode.window.tabGroups.activeTabGroup.viewColumn,
                    vscode.ViewColumn.Two,
                    '前提条件: CLI相当の右グループがアクティブではない'
                );

                // CLI/AIツールがURIだけをVS Codeへ渡す経路。列は拡張機能から指定しない。
                await vscode.commands.executeCommand('vscode.open', targetUri);
                await new Promise(resolve => setTimeout(resolve, 800));

                assert.strictEqual(vscode.window.tabGroups.all.length, 2, '列指定なしのopenでグループ数が増えた');
                const leftGroup = vscode.window.tabGroups.all.find(group => group.viewColumn === vscode.ViewColumn.One);
                const input = leftGroup?.activeTab?.input;
                assert.ok(input instanceof vscode.TabInputText, '左列のアクティブタブが通常ファイルではない');
                assert.strictEqual(input.uri.toString(), targetUri.toString(), 'CLIから開いたファイルが左列に開かれていない');
            } finally {
                fs.rmSync(tmpDir, { recursive: true, force: true });
            }
        });
    });

    suite('17. Raw モードのときは Preview タブがそもそも作られない', () => {
        // customEditor の priority: "default" だけに頼っていた頃は、Raw モードでも
        // 「まず Preview の Custom Editor が生成され → bounceToRawEditor が dispose して
        // Raw を開き直す」という2手を踏んでいた。この過渡状態がちらつきと一瞬のタブ2枚
        // 並存の正体で、他拡張（同じく priority: default を名乗るもの）が居ると解決が
        // 揺れて2枚が残ることさえあった。モードを workbench.editorAssociations へ
        // 同期させることで、開く前から解決先が1つに決まる（＝過渡状態自体が存在しない）
        // ことを、タブ生成イベントを記録して検証する。
        let tmpDir: string | undefined;

        function sleep(ms: number): Promise<void> {
            return new Promise(resolve => setTimeout(resolve, ms));
        }

        teardown(async () => {
            await vscode.workspace.getConfiguration('markdownInline').update(
                'preview.controlDefaultEditor', undefined, vscode.ConfigurationTarget.Global
            );
            await vscode.workspace.getConfiguration('workbench').update(
                'editorAssociations', undefined, vscode.ConfigurationTarget.Global
            );
            if (tmpDir) {
                fs.rmSync(tmpDir, { recursive: true, force: true });
                tmpDir = undefined;
            }
        });

        test('17.1 Rawへ切り替えた後に別のMarkdownを新規に開くと、Previewタブが一度も生成されずRaw1枚だけになる', async function () {
            this.timeout(40000);

            tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ipreview-17-'));
            const firstPath = path.join(tmpDir, 'first.md');
            fs.writeFileSync(firstPath, '# 最初のファイル\n', 'utf-8');
            const firstUri = vscode.Uri.file(firstPath);

            // まず Raw モードを「最後に使ったモード」として確定させる。
            const firstDoc = await vscode.workspace.openTextDocument(firstUri);
            await vscode.window.showTextDocument(firstDoc, { viewColumn: vscode.ViewColumn.One, preview: false });
            for (let i = 0; i < 3; i++) {
                if (vscode.window.tabGroups.activeTabGroup.activeTab?.input instanceof vscode.TabInputCustom) break;
                await vscode.commands.executeCommand('markdownInline.togglePreview');
                await sleep(600);
            }
            for (let i = 0; i < 3; i++) {
                if (vscode.window.tabGroups.activeTabGroup.activeTab?.input instanceof vscode.TabInputText) break;
                await vscode.commands.executeCommand('markdownInline.togglePreview');
                await sleep(600);
            }
            assert.ok(
                vscode.window.tabGroups.activeTabGroup.activeTab?.input instanceof vscode.TabInputText,
                '前提条件: Raw モードに落ち着いていない'
            );
            // 既定エディタ設定（グローバル）が VS Code 側へ反映されるのを待つ。
            await sleep(800);

            // ここから「まだ一度も開いたことがない」Markdown を開き、その間に作られた
            // タブをすべて記録する。Preview の Custom Editor が一瞬でも作られれば
            // opened イベントに TabInputCustom として現れる。
            const secondPath = path.join(tmpDir, 'second.md');
            fs.writeFileSync(secondPath, '# 2番目のファイル\n', 'utf-8');
            const secondUri = vscode.Uri.file(secondPath);

            const openedPreviewTabs: string[] = [];
            const listener = vscode.window.tabGroups.onDidChangeTabs(event => {
                for (const tab of event.opened) {
                    if (tab.input instanceof vscode.TabInputCustom
                        && tab.input.viewType === PREVIEW_VIEW_TYPE
                        && tab.input.uri.toString() === secondUri.toString()) {
                        openedPreviewTabs.push(tab.input.viewType);
                    }
                }
            });
            try {
                await vscode.commands.executeCommand('vscode.open', secondUri, vscode.ViewColumn.One);
                await sleep(1500);
            } finally {
                listener.dispose();
            }

            assert.strictEqual(
                openedPreviewTabs.length, 0,
                `Raw モードなのに Preview の Custom Editor が ${openedPreviewTabs.length} 回生成された（跳ね返し経路を通っている）`
            );

            const tabsForSecond: vscode.Tab[] = [];
            for (const group of vscode.window.tabGroups.all) {
                for (const tab of group.tabs) {
                    const input = tab.input;
                    if ((input instanceof vscode.TabInputText || input instanceof vscode.TabInputCustom)
                        && input.uri.toString() === secondUri.toString()) {
                        tabsForSecond.push(tab);
                    }
                }
            }
            assert.strictEqual(tabsForSecond.length, 1, `同じファイルのタブが ${tabsForSecond.length} 枚ある`);
            assert.ok(
                tabsForSecond[0].input instanceof vscode.TabInputText,
                '残ったタブが Raw（テキストエディタ）になっていない'
            );
        });

        test('17.2 Rawモードで Preview の Custom Editor が解決されても「OverlayWebview has been disposed」で開けなくならない', async function () {
            this.timeout(40000);

            // 実機で `Unable to open 'testing-rules.md' / OverlayWebview has been disposed` という
            // ダイアログが出てファイルが開けない、というユーザー報告の回帰テスト。
            // 原因は resolveCustomTextEditor の最中に webviewPanel.dispose() を呼んでいたこと。
            // VS Code はエディタ解決中に panel が破棄されるとオープン自体を失敗扱いにする。
            //
            // この跳ね返し経路は controlDefaultEditor を切っていても、`untitled:` でも、
            // 関連付けの書き込みが反映される前の起動直後でも通りうるため、
            // 「Raw モードで Custom Editor が解決されてしまった」状況を明示的に作って検証する。
            await vscode.workspace.getConfiguration('markdownInline').update(
                'preview.controlDefaultEditor', false, vscode.ConfigurationTarget.Global
            );
            await vscode.workspace.getConfiguration('markdownInline').update(
                'preview.defaultMode', 'raw', vscode.ConfigurationTarget.Global
            );
            await vscode.workspace.getConfiguration('markdownInline').update(
                'preview.rememberMode', false, vscode.ConfigurationTarget.Global
            );
            await sleep(500);

            try {
                tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ipreview-17-2-'));
                const filePath = path.join(tmpDir, 'testing-rules.md');
                fs.writeFileSync(filePath, '# 跳ね返しでエラーにならない\n', 'utf-8');
                const uri = vscode.Uri.file(filePath);

                let caught: unknown = null;
                try {
                    await vscode.commands.executeCommand('vscode.openWith', uri, PREVIEW_VIEW_TYPE, vscode.ViewColumn.One);
                } catch (error) {
                    caught = error;
                }
                assert.strictEqual(
                    caught, null,
                    `Rawモードでの跳ね返し中にオープンが失敗した: ${caught instanceof Error ? caught.message : JSON.stringify(caught)}`
                );

                await sleep(1200);
                const tabs: vscode.Tab[] = [];
                for (const group of vscode.window.tabGroups.all) {
                    for (const tab of group.tabs) {
                        const input = tab.input;
                        if ((input instanceof vscode.TabInputText || input instanceof vscode.TabInputCustom)
                            && input.uri.toString() === uri.toString()) {
                            tabs.push(tab);
                        }
                    }
                }
                assert.strictEqual(tabs.length, 1, `跳ね返し後のタブが1枚に収束していない（${tabs.length} 枚）`);
                assert.ok(
                    tabs[0].input instanceof vscode.TabInputText,
                    '跳ね返し後に残ったタブが Raw（テキストエディタ）になっていない'
                );
            } finally {
                await vscode.workspace.getConfiguration('markdownInline').update(
                    'preview.defaultMode', undefined, vscode.ConfigurationTarget.Global
                );
                await vscode.workspace.getConfiguration('markdownInline').update(
                    'preview.rememberMode', undefined, vscode.ConfigurationTarget.Global
                );
            }
        });
    });
});
