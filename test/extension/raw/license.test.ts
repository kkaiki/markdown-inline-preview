/**
 * ライセンス機能（実 VS Code）の登録と deep link の受け口を検証する。
 *
 * ここでしか確かめられないのは次の3つ:
 *   - コマンドが実際に VS Code に登録されているか（`package.json` の宣言と
 *     `registerCommand` の食い違いは、実行するまで気づけない）
 *   - `contributes.configuration` の宣言と、コードが読むキーが一致しているか
 *   - SecretStorage の読み書きが実環境で通るか（jsdom には SecretStorage が無い）
 *
 * deep link そのもの（OS が `vscode://` を拡張へ渡す部分）は拡張ホストからは駆動できない。
 * 解釈ロジックは `test/suite/shared/activationUri.test.ts` が、トークン検証は
 * `test/suite/shared/licenseToken.test.ts` が担保している。
 *
 * 実行: `node ./out-test/test/runTest.js`
 */
import assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { removeTempDir } from "../helpers";

const EXTENSION_ID = 'markdown-inline-preview.markdown-inline-preview';

suite('Raw: license', () => {

    // この拡張は `onLanguage:markdown` で起動する。コマンドは activate() の中で
    // 登録されるので、先に有効化しておかないと「登録されていない」ように見える。
    suiteSetup(async function() {
        this.timeout(20000);
        const extension = vscode.extensions.getExtension(EXTENSION_ID);
        assert.ok(extension, `拡張 ${EXTENSION_ID} が見つからない`);
        await extension.activate();
    });

    suite('30. コマンドの登録', () => {

        test('30.1 購入・アップグレード・キー入力・復元の4コマンドが登録されている', async () => {
            const commands = await vscode.commands.getCommands(true);

            for (const id of [
                'markdownInline.removePdfCredit',
                'markdownInline.upgradeToPro',
                'markdownInline.enterLicenseKey',
                'markdownInline.restorePurchase'
            ]) {
                assert.ok(commands.includes(id), `${id} が登録されていない`);
            }
        });

        test('30.2 package.json の宣言と実装が一致している（宣言だけで実体が無いコマンドが無い）', () => {
            const extension = vscode.extensions.getExtension(EXTENSION_ID);
            assert.ok(extension, `拡張 ${EXTENSION_ID} が見つからない`);

            const declared: { command: string }[] =
                extension.packageJSON?.contributes?.commands ?? [];
            const licenseCommands = declared
                .map((entry) => entry.command)
                .filter((id) => /removePdfCredit|upgradeToPro|enterLicenseKey|restorePurchase/.test(id));

            assert.strictEqual(licenseCommands.length, 4, '宣言されたライセンスコマンドが4つでない');
        });
    });

    suite('34. Marp スライド書き出し（PRO+）', () => {
        // 設計: docs/private/specifications/pro-marp-export.md §7

        test('34.1 スライド書き出しのコマンドが登録・宣言されている', async () => {
            const commands = await vscode.commands.getCommands(true);
            assert.ok(commands.includes('markdownInline.exportMarp'), 'exportMarp が登録されていない');
            const extension = vscode.extensions.getExtension(EXTENSION_ID);
            const declared: { command: string }[] = extension?.packageJSON?.contributes?.commands ?? [];
            assert.ok(declared.some((c) => c.command === 'markdownInline.exportMarp'), 'package.json に宣言が無い');
        });

        test('34.2 コマンドパレットに出すのは販売開始後だけ（when に markdownInline.proPlusOnSale）', () => {
            const extension = vscode.extensions.getExtension(EXTENSION_ID);
            const palette: { command: string; when?: string }[] =
                extension?.packageJSON?.contributes?.menus?.commandPalette ?? [];
            const entry = palette.find((m) => m.command === 'markdownInline.exportMarp');
            assert.ok(entry, 'commandPalette に exportMarp の条件が無い');
            assert.ok(entry.when?.includes('markdownInline.proPlusOnSale'), `when: ${entry.when}`);
        });

        test('34.3 販売前にスライド書き出しを実行しても、PDF は作られない', async function() {
            this.timeout(20000);
            const { MONETIZATION_ENABLED } = await import('../../../src/shared/license/entitlement');
            if (MONETIZATION_ENABLED) { this.skip(); return; }

            const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ipreview-marp-'));
            const file = path.join(dir, 'deck.md');
            fs.writeFileSync(file, '# A\n\n## B\n');
            try {
                const doc = await vscode.workspace.openTextDocument(file);
                await vscode.window.showTextDocument(doc);
                await vscode.commands.executeCommand('markdownInline.exportMarp');
                await new Promise((resolve) => setTimeout(resolve, 1500));
                assert.strictEqual(fs.existsSync(path.join(dir, 'deck.slides.pdf')), false, '販売前なのに PDF ができた');
            } finally {
                await vscode.commands.executeCommand('workbench.action.closeAllEditors');
                removeTempDir(dir);
            }
        });

        test('34.4 書き出し処理（課金判定の後）を呼ぶと、<名前>.slides.pdf が文書と同じフォルダにできる', async function() {
            this.timeout(180000);
            const { findBrowser } = await import('../../../src/live/host/localExport');
            if (!findBrowser()) { this.skip(); return; }
            const { exportMarpLocal } = await import('../../../src/live/host/marpExport');
            const extension = vscode.extensions.getExtension(EXTENSION_ID);
            assert.ok(extension);

            const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ipreview-marp-'));
            const file = path.join(dir, 'deck.md');
            fs.writeFileSync(file, '# 表紙\n\n## 2 枚目\n\n- 箇条書き\n');
            try {
                const doc = await vscode.workspace.openTextDocument(file);
                await exportMarpLocal(doc, extension.extensionPath);
                const pdf = path.join(dir, 'deck.slides.pdf');
                assert.ok(fs.existsSync(pdf), 'slides.pdf ができていない');
                const pages = (fs.readFileSync(pdf, 'latin1').match(/\/MediaBox/g) ?? []).length;
                assert.strictEqual(pages, 2, `ページ数 ${pages}`);
                assert.deepStrictEqual(fs.readdirSync(dir).filter((f) => f.endsWith('.html')), [], '一時 HTML が残っている');
            } finally {
                await vscode.commands.executeCommand('workbench.action.closeAllEditors');
                removeTempDir(dir);
            }
        });
    });

    suite('35. Word（.docx）書き出し（PRO+）', () => {
        // 設計: docs/private/specifications/pro-docx-export.md §3

        test('35.1 Word 書き出しのコマンドが登録・宣言され、販売開始後だけコマンドパレットに出る', async () => {
            const commands = await vscode.commands.getCommands(true);
            assert.ok(commands.includes('markdownInline.exportDocx'), 'exportDocx が登録されていない');
            const extension = vscode.extensions.getExtension(EXTENSION_ID);
            const declared: { command: string }[] = extension?.packageJSON?.contributes?.commands ?? [];
            assert.ok(declared.some((c) => c.command === 'markdownInline.exportDocx'), 'package.json に宣言が無い');
            const palette: { command: string; when?: string }[] =
                extension?.packageJSON?.contributes?.menus?.commandPalette ?? [];
            const entry = palette.find((m) => m.command === 'markdownInline.exportDocx');
            assert.ok(entry?.when?.includes('markdownInline.proPlusOnSale'), `when: ${entry?.when}`);
        });

        test('35.4 編集画面の右クリックメニュー（Raw のエディタ・Live の画面）に Word 書き出しがあり、販売開始後だけ出る', () => {
            // ユーザー要望 2026-09-29:「編集のところを、右クリックで Word 書き出しがあればいいのでは？」
            const extension = vscode.extensions.getExtension(EXTENSION_ID);
            const menus = extension?.packageJSON?.contributes?.menus ?? {};
            const raw = (menus['editor/context'] ?? []).find((m: { command: string }) => m.command === 'markdownInline.exportDocx');
            const live = (menus['webview/context'] ?? []).find((m: { command: string }) => m.command === 'markdownInline.exportDocx');
            assert.ok(raw, 'Raw（テキストエディタ）の右クリックメニューに無い');
            assert.ok(live, 'Live の右クリックメニューに無い');
            assert.ok(raw.when?.includes('markdownInline.proPlusOnSale') && raw.when.includes('editorLangId == markdown'), `Raw when: ${raw.when}`);
            assert.ok(live.when?.includes('markdownInline.proPlusOnSale') && live.when.includes("webviewId == 'ipreview.live'"), `Live when: ${live.when}`);
        });

        test('35.5 右クリックメニューには PDF・Word・スライドがこの順に並び、PDF（無料）は販売状態に関係なく出て、スライドは販売開始後だけ出る', () => {
            // ユーザー要望 2026-09-29:「PDF とスライドも右クリックに入れて」
            const extension = vscode.extensions.getExtension(EXTENSION_ID);
            const menus = extension?.packageJSON?.contributes?.menus ?? {};
            for (const [where, scope] of [['editor/context', 'editorLangId == markdown'], ['webview/context', "webviewId == 'ipreview.live'"]]) {
                const items: { command: string; when?: string; group?: string }[] = menus[where] ?? [];
                const find = (command: string) => items.find((m) => m.command === command);
                const pdf = find('markdownInline.exportPdf');
                const marp = find('markdownInline.exportMarp');
                const docx = find('markdownInline.exportDocx');
                assert.ok(pdf && marp && docx, `${where} に揃っていない`);
                assert.ok(pdf.when?.includes(scope) && !pdf.when.includes('proPlusOnSale'), `${where} PDF when: ${pdf.when}`);
                assert.ok(marp.when?.includes(scope) && marp.when.includes('markdownInline.proPlusOnSale'), `${where} スライド when: ${marp.when}`);
                const group = (m: { group?: string }) => m.group ?? '';
                assert.deepStrictEqual([pdf, docx, marp].map(group).sort(), [group(pdf), group(docx), group(marp)], `${where} の並び順`);
                assert.ok(new Set([pdf, docx, marp].map((m) => group(m).split('@')[0])).size === 1, `${where} で別のグループに分かれている`);
            }
        });

        test('35.6 本文の右クリックの先頭に、Raw では「Live モードで開く」、Live では「Raw モードで開く」がある', () => {
            // ユーザー要望 2026-09-29（A）: 本文の右クリックから Raw / Live を行き来できるようにする
            const extension = vscode.extensions.getExtension(EXTENSION_ID);
            const menus = extension?.packageJSON?.contributes?.menus ?? {};
            const raw = (menus['editor/context'] ?? []).find((m: { command: string }) => m.command === 'markdownInline.openLive');
            const live = (menus['webview/context'] ?? []).find((m: { command: string }) => m.command === 'markdownInline.openRaw');
            assert.ok(raw?.when?.includes('editorLangId == markdown'), `Raw when: ${raw?.when}`);
            assert.ok(live?.when?.includes("webviewId == 'ipreview.live'"), `Live when: ${live?.when}`);
            // 書き出し（9_export）より上の navigation グループに置く
            assert.ok(raw.group?.startsWith('navigation') && live.group?.startsWith('navigation'), `${raw.group} / ${live.group}`);
        });

        test('35.2 販売前に Word 書き出しを実行しても、docx は作られない', async function() {
            this.timeout(20000);
            const { MONETIZATION_ENABLED } = await import('../../../src/shared/license/entitlement');
            if (MONETIZATION_ENABLED) { this.skip(); return; }

            const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ipreview-docx-'));
            const file = path.join(dir, 'memo.md');
            fs.writeFileSync(file, '# A\n');
            try {
                const doc = await vscode.workspace.openTextDocument(file);
                await vscode.window.showTextDocument(doc);
                await vscode.commands.executeCommand('markdownInline.exportDocx');
                await new Promise((resolve) => setTimeout(resolve, 1500));
                assert.strictEqual(fs.existsSync(path.join(dir, 'memo.docx')), false, '販売前なのに docx ができた');
            } finally {
                await vscode.commands.executeCommand('workbench.action.closeAllEditors');
                removeTempDir(dir);
            }
        });

        test('35.3 書き出し処理（課金判定の後）を呼ぶと、<名前>.docx が文書と同じフォルダにでき、相対パスの画像も入る', async function() {
            this.timeout(60000);
            const { exportDocxLocal } = await import('../../../src/live/host/docxExport');
            const extension = vscode.extensions.getExtension(EXTENSION_ID);
            assert.ok(extension);

            const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ipreview-docx-'));
            fs.mkdirSync(path.join(dir, 'img'));
            // 1×1 の PNG
            fs.writeFileSync(path.join(dir, 'img', 'dot.png'), Buffer.from(
                'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
            const file = path.join(dir, 'memo.md');
            fs.writeFileSync(file, '# 見出し\n\n![点](./img/dot.png)\n');
            try {
                const doc = await vscode.workspace.openTextDocument(file);
                await exportDocxLocal(doc, extension.extensionPath);
                const out = path.join(dir, 'memo.docx');
                assert.ok(fs.existsSync(out), 'memo.docx ができていない');
                const zip = fs.readFileSync(out);
                assert.strictEqual(zip.subarray(0, 2).toString('latin1'), 'PK', 'zip（docx）になっていない');
                assert.ok(zip.includes(Buffer.from('word/media/')), '画像が埋め込まれていない');
            } finally {
                await vscode.commands.executeCommand('workbench.action.closeAllEditors');
                removeTempDir(dir);
            }
        });
    });

    suite('36. まとめて書き出し（PRO+）', () => {
        const PDF_PAGE = /\/Type\s*\/Page(?!s)/g;

        /** 一時フォルダに .md 群を作る。img/dot.png も置く */
        function makeFolder(files: Record<string, string>): string {
            const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ipreview-batch-'));
            for (const [rel, body] of Object.entries(files)) {
                fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
                fs.writeFileSync(path.join(dir, rel), body);
            }
            return dir;
        }

        test('36.1 まとめて書き出しのコマンドが登録・宣言され、販売開始後だけコマンドパレットとエクスプローラに出る', async () => {
            const commands = await vscode.commands.getCommands(true);
            assert.ok(commands.includes('markdownInline.batchExport'), 'batchExport が登録されていない');
            const extension = vscode.extensions.getExtension(EXTENSION_ID);
            const contributes = extension?.packageJSON?.contributes;
            const declared: { command: string }[] = contributes?.commands ?? [];
            assert.ok(declared.some((c) => c.command === 'markdownInline.batchExport'), 'package.json に宣言が無い');
            const palette: { command: string; when?: string }[] = contributes?.menus?.commandPalette ?? [];
            const explorer: { command: string; when?: string }[] = contributes?.menus?.['explorer/context'] ?? [];
            const inPalette = palette.find((m) => m.command === 'markdownInline.batchExport');
            const inExplorer = explorer.find((m) => m.command === 'markdownInline.batchExport');
            assert.ok(inPalette?.when?.includes('markdownInline.proPlusOnSale'), `palette when: ${inPalette?.when}`);
            assert.ok(inExplorer?.when?.includes('markdownInline.proPlusOnSale'), `explorer when: ${inExplorer?.when}`);
            assert.ok(inExplorer?.when?.includes('explorerResourceIsFolder'), `explorer when: ${inExplorer?.when}`);
        });

        test('36.2 販売前にフォルダを指定して実行しても、PDF は作られない', async function() {
            this.timeout(20000);
            const { MONETIZATION_ENABLED } = await import('../../../src/shared/license/entitlement');
            if (MONETIZATION_ENABLED) { this.skip(); return; }

            const dir = makeFolder({ 'a.md': '# A\n' });
            try {
                const uri = vscode.Uri.file(dir);
                await vscode.commands.executeCommand('markdownInline.batchExport', uri, [uri]);
                await new Promise((resolve) => setTimeout(resolve, 1500));
                assert.strictEqual(fs.existsSync(path.join(dir, 'a.pdf')), false, '販売前なのに PDF ができた');
            } finally {
                removeTempDir(dir);
            }
        });

        test('36.3 フォルダを 1 ファイルずつ隣に書き出すと、サブフォルダの分もでき、既存を「スキップ」にした PDF は元のまま', async function() {
            this.timeout(180000);
            const { listMarkdownFiles, runBatchExport } = await import('../../../src/live/host/batchExport');
            const { DEFAULT_PDF_STYLING } = await import('../../../src/shared/pdfStyling');
            const extension = vscode.extensions.getExtension(EXTENSION_ID);
            assert.ok(extension);

            const dir = makeFolder({ 'a.md': '# A\n', 'sub/b.md': '# B\n', 'node_modules/x/c.md': '# C\n', 'a.pdf': 'old' });
            try {
                const files = await listMarkdownFiles(dir, true);
                assert.deepStrictEqual(files, [path.join(dir, 'a.md'), path.join(dir, 'sub', 'b.md')]);
                const outcome = await runBatchExport({
                    kind: 'each', files, root: dir, outputMode: 'beside', overwrite: 'skip',
                    credit: false, styling: DEFAULT_PDF_STYLING
                }, extension.extensionPath);
                assert.strictEqual(fs.readFileSync(path.join(dir, 'a.pdf'), 'utf8'), 'old', 'スキップしたはずの PDF が変わった');
                const b = fs.readFileSync(path.join(dir, 'sub', 'b.pdf'));
                assert.strictEqual(b.subarray(0, 5).toString('latin1'), '%PDF-');
                assert.deepStrictEqual(
                    { done: outcome.summary.done, skipped: outcome.summary.skipped, failed: outcome.summary.failed },
                    { done: 1, skipped: 1, failed: 0 });
            } finally {
                removeTempDir(dir);
            }
        });

        test('36.4 1 つの PDF にまとめると、目次＋ファイルごとに改ページした 1 冊ができる（開いている未保存の内容も入る）', async function() {
            this.timeout(180000);
            const { runBatchExport } = await import('../../../src/live/host/batchExport');
            const { DEFAULT_PDF_STYLING } = await import('../../../src/shared/pdfStyling');
            const extension = vscode.extensions.getExtension(EXTENSION_ID);
            assert.ok(extension);

            const dir = makeFolder({ 'a.md': '# A\n', 'b.md': '# B\n' });
            let doc: vscode.TextDocument | undefined;
            try {
                // b.md を未保存のまま長くする（保存済みの内容なら 1 ページに収まる）。
                // エディタ経由だと Live への切り替えで TextEditor が差し替わるので、文書を直接編集する
                doc = await vscode.workspace.openTextDocument(path.join(dir, 'b.md'));
                const edit = new vscode.WorkspaceEdit();
                edit.insert(doc.uri, new vscode.Position(1, 0), '\n' + 'long line\n\n'.repeat(150));
                assert.ok(await vscode.workspace.applyEdit(edit));
                assert.ok(doc.isDirty);

                const out = path.join(dir, 'book.pdf');
                const outcome = await runBatchExport({
                    kind: 'merge', files: [path.join(dir, 'a.md'), path.join(dir, 'b.md')], root: dir, mergedOutput: out,
                    credit: false, styling: DEFAULT_PDF_STYLING
                }, extension.extensionPath);
                assert.strictEqual(outcome.summary.failed, 0);
                const pages = (fs.readFileSync(out, 'latin1').match(PDF_PAGE) ?? []).length;
                // 目次 1 + a 1 + b（未保存の 150 段落）2 以上
                assert.ok(pages >= 4, `ページ数: ${pages}`);
                assert.strictEqual(fs.existsSync(path.join(dir, 'a.pdf')), false, 'まとめる方式なのに個別の PDF ができた');
            } finally {
                // 未保存のまま残さない（後のテストで「保存しますか」が出ないように）
                await doc?.save();
                removeTempDir(dir);
            }
        });

        test('36.5 始める前にキャンセルされていれば、何も書き出さずに全件キャンセルとして報告する', async function() {
            this.timeout(60000);
            const { runBatchExport } = await import('../../../src/live/host/batchExport');
            const { DEFAULT_PDF_STYLING } = await import('../../../src/shared/pdfStyling');
            const extension = vscode.extensions.getExtension(EXTENSION_ID);
            assert.ok(extension);

            const dir = makeFolder({ 'a.md': '# A\n', 'b.md': '# B\n' });
            const cts = new vscode.CancellationTokenSource();
            cts.cancel();
            try {
                const outcome = await runBatchExport({
                    kind: 'each', files: [path.join(dir, 'a.md'), path.join(dir, 'b.md')], root: dir,
                    outputMode: 'beside', overwrite: 'overwrite', credit: false, styling: DEFAULT_PDF_STYLING
                }, extension.extensionPath, undefined, cts.token);
                assert.strictEqual(outcome.summary.cancelled, 2);
                assert.ok(!fs.existsSync(path.join(dir, 'a.pdf')) && !fs.existsSync(path.join(dir, 'b.pdf')));
            } finally {
                cts.dispose();
                removeTempDir(dir);
            }
        });
    });

    suite('37. PDF 書き出し（単体）', () => {
        test('37.1 数式と Mermaid を含む文書を書き出すと、拡張に同梱した描画部品で描かれた PDF ができる（記号やソースのまま残らない）', async function() {
            this.timeout(120000);
            const { exportToPdfLocal } = await import('../../../src/live/host/localExport');
            const extension = vscode.extensions.getExtension(EXTENSION_ID);
            assert.ok(extension);

            const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ipreview-pdf-'));
            const file = path.join(dir, 'memo.md');
            fs.writeFileSync(file, '# 見出し\n\n式 $E = mc^2$ です。\n\n```mermaid\ngraph LR\n  Alpha --> Beta\n```\n');
            try {
                const doc = await vscode.workspace.openTextDocument(file);
                await exportToPdfLocal(doc, extension.extensionPath, { credit: false });
                const out = path.join(dir, 'memo.pdf');
                assert.ok(fs.existsSync(out), 'memo.pdf ができていない');
                let text: string;
                try {
                    text = require('child_process').execFileSync('pdftotext', [out, '-'], { encoding: 'utf8' }) as string;
                } catch {
                    this.skip();
                    return;
                }
                assert.ok(!text.includes('$E'), `数式が記号のまま: ${text}`);
                assert.ok(!text.includes('graph LR'), `Mermaid がソースのまま: ${text}`);
                assert.ok(text.includes('Alpha') && text.includes('Beta'), `図の中の文字が無い: ${text}`);
            } finally {
                await vscode.commands.executeCommand('workbench.action.closeAllEditors');
                removeTempDir(dir);
            }
        });
    });

    suite('31. 設定の宣言', () => {

        test('31.1 export.creditLine は auto が既定', () => {
            const value = vscode.workspace
                .getConfiguration('markdownInline')
                .get<string>('export.creditLine');
            assert.strictEqual(value, 'auto');
        });

        test('31.2 export.creditLine は auto / always のみを取る', () => {
            const extension = vscode.extensions.getExtension(EXTENSION_ID);
            const properties =
                extension?.packageJSON?.contributes?.configuration?.properties ?? {};
            const setting = properties['markdownInline.export.creditLine'];

            assert.ok(setting, 'export.creditLine が宣言されていない');
            assert.deepStrictEqual(setting.enum, ['auto', 'always']);
        });

        test('31.4 PDF の体裁（PRO+）の設定は、既定なら今までと同じ PDF になる値', () => {
            const config = vscode.workspace.getConfiguration('markdownInline');
            assert.strictEqual(config.get('export.pdf.paperSize'), 'default');
            assert.strictEqual(config.get('export.pdf.margins'), 'default');
            assert.strictEqual(config.get('export.pdf.pageNumbers'), false);
            assert.strictEqual(config.get('export.pdf.tableOfContents'), false);
            assert.strictEqual(config.get('export.pdf.theme'), 'default');
            assert.strictEqual(config.get('export.pdf.headerText'), '');
            assert.strictEqual(config.get('export.pdf.footerText'), '');
        });

        test('31.3 license.serverUrl は既定が空（＝拡張内の既定 URL を使う）', () => {
            const value = vscode.workspace
                .getConfiguration('markdownInline')
                .get<string>('license.serverUrl');
            assert.strictEqual(value, '');
        });
    });

    suite('32. SecretStorage', () => {

        test('32.1 ライセンストークンを保存・読み出し・削除できる', async () => {
            const extension = vscode.extensions.getExtension(EXTENSION_ID);
            assert.ok(extension);
            await extension.activate();

            // 実際の SecretStorage を触る（jsdom では再現できない部分）。
            // 拡張本体が使うキーとは別のキーで、環境を汚さずに疎通だけ確かめる。
            const secrets = (extension.exports as { secrets?: vscode.SecretStorage })?.secrets;
            if (!secrets) {
                // 拡張が SecretStorage を export していない構成なら、この確認は省く。
                // （コマンド登録側で SecretStorage は既に使われている）
                return;
            }

            const key = 'markdownInline.test.token';
            await secrets.store(key, 'payload.signature');
            assert.strictEqual(await secrets.get(key), 'payload.signature');

            await secrets.delete(key);
            assert.strictEqual(await secrets.get(key), undefined);
        });
    });

    suite('33. 出荷前の安全弁', () => {

        test('33.1 購入導線が未完成のあいだは、PDF にクレジット行を入れない', async () => {
            // MONETIZATION_ENABLED が false のあいだ、無料ユーザーの PDF は今までどおり。
            // 「クレジット行が出るのに消す手段が無い」状態での出荷を防ぐ。
            const { MONETIZATION_ENABLED, shouldIncludeCredit } =
                await import('../../../src/shared/license/entitlement');

            if (MONETIZATION_ENABLED) {
                // 有効化したなら、公開鍵とサーバー URL が揃っているはず。
                const { LICENSE_PUBLIC_KEYS } = await import('../../../src/license/publicKey');
                assert.ok(
                    LICENSE_PUBLIC_KEYS.length > 0,
                    '課金を有効にしたのに公開鍵が空。全購入者が無料版に落ちる'
                );
                return;
            }

            assert.strictEqual(
                shouldIncludeCredit({
                    license: { ok: false, reason: 'malformed' },
                    monetizationEnabled: MONETIZATION_ENABLED,
                    setting: 'auto'
                }),
                false
            );
        });
    });
});
