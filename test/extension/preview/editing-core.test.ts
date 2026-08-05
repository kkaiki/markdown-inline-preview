/**
 * Preview モード（実 VS Code）での「内容の忠実性」を end-to-end で固定する。
 *
 * 対象: Raw→Preview→Raw の往復、および webview からの書き戻し（`change` メッセージ）で、
 * 空行・改行コード・末尾改行・frontmatter・相対パス画像・非 ASCII ファイル名といった
 * 「壊れると気づきにくいがファイルに残ってしまう」要素が保たれること。
 * webview の直列化そのものは `test/browser`/`test/webview` が見ているため、ここでは
 * ホスト側（ディスク read・WorkspaceEdit・save・frontmatter 再結合・画像 URI 復元）を通す。
 *
 * 発端: 2026-07-26 の探索的監査（`docs/testing/preview-audit-2026-07-26.md`）。
 * この観点の実 VS Code テストが 1 件も無く、実際に frontmatter 直後の空行が消える
 * 不具合が見つかった（先頭空行のケースは修正まで backlog 4.5.1 に記録）。
 *
 * 実行: `node ./out-test/test/runTest.js`（VS Code を1回起動し、extension/ 配下の
 * 全テストファイルと同じインスタンス内で実行する）。`MOCHA_GREP` で絞り込み可能。
 */
import assert from "assert";
import * as vscode from "vscode";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { closeAllEditors } from "../helpers";

const PREVIEW_VIEW_TYPE = 'ipreview.preview';

suite('Preview: editing-core（内容の忠実性・実 VS Code end-to-end）', () => {
    let tmpDir: string | undefined;

    function sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function previewTabCount(uri: vscode.Uri): number {
        let count = 0;
        for (const group of vscode.window.tabGroups.all) {
            for (const tab of group.tabs) {
                if (tab.input instanceof vscode.TabInputCustom
                    && tab.input.viewType === PREVIEW_VIEW_TYPE
                    && tab.input.uri.toString() === uri.toString()) {
                    count++;
                }
            }
        }
        return count;
    }

    function writeMd(name: string, content: string): vscode.Uri {
        if (!tmpDir) tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ipreview-editing-core-'));
        const filePath = path.join(tmpDir, name);
        fs.writeFileSync(filePath, content, 'utf-8');
        return vscode.Uri.file(filePath);
    }

    async function openRaw(uri: vscode.Uri): Promise<vscode.TextEditor> {
        const doc = await vscode.workspace.openTextDocument(uri);
        return await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.One, preview: false });
    }

    /** アクティブなタブが Preview（Custom Editor）になるまで togglePreview する。 */
    async function ensurePreview(): Promise<void> {
        for (let i = 0; i < 3; i++) {
            if (vscode.window.tabGroups.activeTabGroup.activeTab?.input instanceof vscode.TabInputCustom) return;
            await vscode.commands.executeCommand('markdownInline.togglePreview');
            await sleep(600);
        }
    }

    /** アクティブなタブが Raw（テキストエディタ）になるまで togglePreview する。 */
    async function ensureRaw(): Promise<void> {
        for (let i = 0; i < 3; i++) {
            if (vscode.window.tabGroups.activeTabGroup.activeTab?.input instanceof vscode.TabInputText) return;
            await vscode.commands.executeCommand('markdownInline.togglePreview');
            await sleep(600);
        }
    }

    /** webview からの `change` 受信経路（enqueueWebviewChange → applyMarkdownFromWebview）を直接叩く。 */
    async function injectAndSettle(uri: vscode.Uri, markdown: string): Promise<void> {
        const ok = await vscode.commands.executeCommand(
            'markdownInline.__test.injectWebviewChange', uri.toString(), markdown
        );
        assert.strictEqual(ok, true, 'テスト用フック（injectWebviewChange）が Preview の webview を見つけられなかった');
        await sleep(800);
    }

    teardown(async () => {
        await closeAllEditors();
        if (tmpDir) {
            fs.rmSync(tmpDir, { recursive: true, force: true });
            tmpDir = undefined;
        }
    });

    test('19.1 連続する空行を含む本文は Raw→Preview→Raw の往復で 1 行も増減せず、dirty にもならない', async function () {
        this.timeout(40000);

        const content = '# 見出し\n\n\n段落1\n\n\n\n段落2\n\n- item\n\n\n- item2\n';
        const uri = writeMd('blank-lines.md', content);
        const editor = await openRaw(uri);
        await ensurePreview();
        await sleep(800);
        await ensureRaw();
        await sleep(800);

        assert.strictEqual(editor.document.getText(), content,
            `Raw→Preview→Raw で空行構成が変わった: ${JSON.stringify(editor.document.getText())}`);
        assert.strictEqual(editor.document.isDirty, false, '往復しただけで dirty になっている');
        assert.strictEqual(fs.readFileSync(uri.fsPath, 'utf-8'), content,
            `ディスク内容が書き換えられた: ${JSON.stringify(fs.readFileSync(uri.fsPath, 'utf-8'))}`);
    });

    test('19.2 webview がブロック間に増やした空行は、その本数のままディスクへ保存される', async function () {
        this.timeout(40000);

        const uri = writeMd('blank-lines-write.md', '# 見出し\n\n段落1\n');
        const editor = await openRaw(uri);
        await ensurePreview();
        await sleep(800);

        const next = '# 見出し\n\n\n段落1\n\n\n\n段落2\n';
        await injectAndSettle(uri, next);

        assert.strictEqual(editor.document.getText(), next,
            `空行が document モデルで潰れた: ${JSON.stringify(editor.document.getText())}`);
        assert.strictEqual(fs.readFileSync(uri.fsPath, 'utf-8'), next,
            `空行がディスクで潰れた: ${JSON.stringify(fs.readFileSync(uri.fsPath, 'utf-8'))}`);
    });

    test('19.2b frontmatter 付きファイルを Preview 経由で編集しても、--- 直後の空行が消えない', async function () {
        this.timeout(40000);

        // splitFrontmatter は本文を `\n# 本文...`（先頭が空行）の形で webview へ渡すため、
        // 先頭空行が復元されないと `---` と本文がくっついて保存される
        // （blank-line-preservation.md §11、2026-07-26 の監査で実操作から発見）。
        const original = '---\ntitle: テスト\ntags: [a, b]\n---\n\n# 本文\n\nここを編集する\n';
        const uri = writeMd('frontmatter.md', original);
        const editor = await openRaw(uri);
        await ensurePreview();
        await sleep(900);

        // webview が送り返す本文（frontmatter を除いた部分。先頭の空行を含む）。
        await injectAndSettle(uri, '\n# 本文\n\nここを編集するあいう\n');

        const expected = '---\ntitle: テスト\ntags: [a, b]\n---\n\n# 本文\n\nここを編集するあいう\n';
        assert.strictEqual(editor.document.getText(), expected,
            `frontmatter 直後の空行が失われた: ${JSON.stringify(editor.document.getText())}`);
        assert.strictEqual(fs.readFileSync(uri.fsPath, 'utf-8'), expected,
            `ディスク上で frontmatter 直後の空行が失われた: ${JSON.stringify(fs.readFileSync(uri.fsPath, 'utf-8'))}`);
    });

    test('19.3 空（0 バイト）の .md も Preview 化でき、往復しても空のまま', async function () {
        this.timeout(40000);

        const uri = writeMd('empty.md', '');
        const editor = await openRaw(uri);
        await ensurePreview();
        await sleep(1000);
        assert.strictEqual(previewTabCount(uri), 1, '空ファイルが Preview 化できていない');

        await ensureRaw();
        await sleep(800);
        assert.strictEqual(editor.document.getText(), '',
            `空ファイルが往復で書き換わった: ${JSON.stringify(editor.document.getText())}`);
        assert.strictEqual(fs.readFileSync(uri.fsPath, 'utf-8'), '',
            `空ファイルのディスク内容が書き換わった: ${JSON.stringify(fs.readFileSync(uri.fsPath, 'utf-8'))}`);
    });

    test('19.4 CRLF 改行のファイルを Preview 経由で編集しても、CRLF と LF が混在しない', async function () {
        this.timeout(40000);

        // webview 側は常に LF で直列化した全文を送るため、ホスト側で文書の改行コードへ
        // 揃わないと、1 ファイル内に CRLF と LF が混ざった状態で保存されてしまう。
        const uri = writeMd('crlf.md', '# CRLF\r\n\r\n本文\r\n');
        await openRaw(uri);
        await ensurePreview();
        await sleep(800);

        await injectAndSettle(uri, '# CRLF\n\n本文\n\n追記\n');

        const onDisk = fs.readFileSync(uri.fsPath, 'utf-8');
        const hasCrlf = /\r\n/.test(onDisk);
        const hasLoneLf = /(^|[^\r])\n/.test(onDisk);
        assert.ok(!(hasCrlf && hasLoneLf),
            `CRLF と LF が混在したファイルになった: ${JSON.stringify(onDisk)}`);
    });

    test('19.5 末尾に改行が無いファイルを Raw→Preview→Raw しても末尾が変わらない', async function () {
        this.timeout(40000);

        const original = '# 末尾改行なし\n\n本文';
        const uri = writeMd('no-trailing-newline.md', original);
        const editor = await openRaw(uri);
        await ensurePreview();
        await sleep(800);
        await ensureRaw();
        await sleep(800);

        assert.strictEqual(editor.document.getText(), original,
            `末尾改行なしのファイルが往復で変わった: ${JSON.stringify(editor.document.getText())}`);
        assert.strictEqual(fs.readFileSync(uri.fsPath, 'utf-8'), original,
            `ディスク内容が変わった: ${JSON.stringify(fs.readFileSync(uri.fsPath, 'utf-8'))}`);
    });

    test('19.6 日本語・スペースを含むファイル名でも Preview 化と保存ができる', async function () {
        this.timeout(40000);

        const uri = writeMd('日本語 ファイル名 test.md', '# 日本語ファイル名\n');
        const editor = await openRaw(uri);
        await ensurePreview();
        await sleep(900);
        assert.strictEqual(previewTabCount(uri), 1, '日本語ファイル名が Preview 化できていない');

        await injectAndSettle(uri, '# 日本語ファイル名\n\n追記\n');
        assert.strictEqual(fs.readFileSync(uri.fsPath, 'utf-8'), '# 日本語ファイル名\n\n追記\n',
            `日本語ファイル名で保存内容が壊れた: ${JSON.stringify(fs.readFileSync(uri.fsPath, 'utf-8'))}`);
        assert.strictEqual(editor.document.isDirty, false, '保存されず dirty のまま残っている');
    });

    test('19.7 相対パスの画像リンクは、Preview 経由で編集しても相対パスのまま保存される', async function () {
        this.timeout(40000);

        // Preview 表示中は webview URI へ書き換えられるため、書き戻し時に
        // restoreMarkdownImagesFromWebview で元の相対パスへ戻る必要がある。
        const uri = writeMd('image.md', '# 画像\n\n![alt](assets/sample.png)\n\n本文\n');
        const editor = await openRaw(uri);
        await ensurePreview();
        await sleep(900);

        await injectAndSettle(uri, '# 画像\n\n![alt](assets/sample.png)\n\n本文\n\n追記\n');

        const onDisk = fs.readFileSync(uri.fsPath, 'utf-8');
        assert.ok(onDisk.includes('![alt](assets/sample.png)'),
            `画像の相対パスが webview URI 等に置き換わって保存された: ${JSON.stringify(onDisk)}`);
        assert.strictEqual(editor.document.isDirty, false, '保存されず dirty のまま残っている');
    });
});
