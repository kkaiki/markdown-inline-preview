/**
 * Raw モード（実 VS Code）の外部書き換え検知を検証する。
 *
 * 対象: `createFileSystemWatcher` 自体の発火確認、および TextDocument の
 * 自動リロードに関する既知の制約（実環境での手動確認が必要な既知課題を skip で記録）。
 *
 * 実行: `node ./out-test/test/runTest.js`（VS Code を1回起動し、extension/ 配下の
 * 全テストファイルと同じインスタンス内で実行する）。`MOCHA_GREP` でテスト名の絞り込みが可能。
 */
import assert from "assert";
import * as vscode from "vscode";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { closeAllEditors } from "../helpers";

suite('Raw: external-sync', () => {

    teardown(async () => {
        await closeAllEditors();
    });

    suite('11. 実 VS Code 環境でのバグハンティング', () => {
        // createTestDocument は untitled（ディスク上に実体を持たない）文書を作るため、
        // 「外部ツールがディスク上のファイルを直接書き換える」シナリオは検証できない。
        // このスイートでは実ファイルを一時ディレクトリに作成して使う。
        let tmpDir: string | undefined;

        teardown(() => {
            if (tmpDir) {
                fs.rmSync(tmpDir, { recursive: true, force: true });
                tmpDir = undefined;
            }
        });

        async function openRealFile(content: string): Promise<{ editor: vscode.TextEditor; filePath: string }> {
            tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ipreview-ext-test-'));
            const filePath = path.join(tmpDir, 'doc.md');
            fs.writeFileSync(filePath, content, 'utf-8');
            const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
            const editor = await vscode.window.showTextDocument(doc);
            return { editor, filePath };
        }

        // このテストは @vscode/test-electron のヘッドレス環境では一貫して失敗する
        // （TextDocument が外部変更を自動リロードしない）。11.1c で切り分けた通り
        // createFileSystemWatcher 自体はこの環境でも確実に発火するため、原因は
        // 「ネイティブファイル監視が効かない」ことではなく「VS Code の TextDocument
        // モデルが自動リロードしない」こと（実デスクトップ環境でも同様かはこの
        // テストハーネスだけでは確認できない。実 VS Code で手動確認が必要）。
        // Preview モードは readDocumentFromDisk() でファイルを直接読むためこの問題の
        // 影響を受けないが、Raw モード（標準 TextEditor）は TextDocument の自動リロードに
        // 依存しており、もし実環境でも同じなら「LLM 等が Raw 編集中のファイルを外部から
        // 書き換えても、開いたままの Raw タブには反映されない」可能性がある。恒常的に
        // 失敗するテストとして CI を赤くし続けないよう skip し、知見を記録するに留める。
        test.skip('11.1 外部ツール（LLM等）がディスク上の実ファイルを直接書き換えると、VS Code の文書内容が更新される（要:実環境での手動確認）', async function () {
            this.timeout(30000);

            const { editor, filePath } = await openRealFile('# 元のタイトル\n\n元の本文\n');
            const doc = editor.document;
            assert.strictEqual(doc.getText(), '# 元のタイトル\n\n元の本文\n', '前提: 初期内容が正しく開けていない');

            let changeEventFired = false;
            const changeSub = vscode.workspace.onDidChangeTextDocument(e => {
                if (e.document.uri.toString() === doc.uri.toString()) changeEventFired = true;
            });

            try {
                // vscode.workspace.applyEdit を経由せず、Node の fs で直接書き換える
                // （LLM やターミナル上のツールが .md を編集する状況を模す）。
                const externalContent = '# 外部から変更されたタイトル\n\n外部ツールが書き換えた本文\n';
                fs.writeFileSync(filePath, externalContent, 'utf-8');

                // VS Code 側がファイル変更を検知して文書を自動リロードするまで待つ
                // （ローカルに未保存の変更が無いクリーンな文書は、ディスク変更を自動反映するはず）。
                // `doc` への参照を保持したまま `getText()` を毎回呼び直す（reload時に別インスタンスへ
                // 差し替わる場合、古い参照を握ったままだと更新を拾えない可能性があるため
                // `vscode.window.activeTextEditor` からも都度取り直して比較する）。
                let reloaded = false;
                for (let i = 0; i < 40; i++) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                    const currentText = vscode.window.activeTextEditor?.document.getText() ?? doc.getText();
                    if (currentText === externalContent) {
                        reloaded = true;
                        break;
                    }
                }
                assert.ok(
                    reloaded,
                    `外部書き換えが VS Code の文書に反映されなかった（onDidChangeTextDocument 発火: ${changeEventFired}, 現在の内容: ${JSON.stringify(vscode.window.activeTextEditor?.document.getText() ?? doc.getText())}）`
                );
            } finally {
                changeSub.dispose();
            }
        });

        test('11.1c vscode.workspace.createFileSystemWatcher 自体は外部書き換えを確実に検知する（11.1 の切り分け）', async function () {
            this.timeout(20000);
            // 11.1 が失敗する原因が「ファイル監視そのものが働いていない」なのか、
            // 「VS Code の TextDocument モデルが自動リロードしないだけ」なのかを切り分ける。
            // Preview モードが使っているのと同じ createFileSystemWatcher を単体で検証する。
            tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ipreview-ext-test-fsw-'));
            const filePath = path.join(tmpDir, 'doc.md');
            fs.writeFileSync(filePath, 'hello\n', 'utf-8');

            const watcher = vscode.workspace.createFileSystemWatcher(
                new vscode.RelativePattern(tmpDir, 'doc.md')
            );
            let fired = false;
            watcher.onDidChange(() => { fired = true; });
            await new Promise(resolve => setTimeout(resolve, 300));

            fs.writeFileSync(filePath, 'changed\n', 'utf-8');

            for (let i = 0; i < 30 && !fired; i++) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            watcher.dispose();

            assert.ok(
                fired,
                'createFileSystemWatcher 自体が発火しない（この場合は 11.1 の失敗は監視機構全体の問題）'
            );
            // fired === true なら、11.1 の失敗は「TextDocument が自動リロードしない」ことが原因と
            // 特定できる。Preview 側は readDocumentFromDisk() で直接ファイルを読むためこの問題の
            // 影響を受けないが、Raw モード（VS Code 標準の TextEditor）は TextDocument の自動
            // リロードに依存しており、同じ問題の影響を受ける可能性がある。
        });
    });
});
