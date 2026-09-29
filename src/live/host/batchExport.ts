/**
 * まとめて書き出し（PRO+）の host 側。フォルダ・複数選択の .md を PDF にする（1 ファイルずつ／1 冊にまとめる）。
 *
 * - `runBatchExport`: 決まった条件で書き出す本体（UI なし。実 VS Code テストから直接呼ぶ）
 * - `runBatchExportCommand`: 対象の決定 → QuickPick → 本体を進捗付きで → 結果の報告
 * 課金の判定は呼び出し側（liveEditorProvider の batchExport）で済ませてから呼ぶ。
 * 並べ順・出力先・HTML の組み立ては `src/shared/batchExport/`（純関数）、印刷は `chromePdf.ts`。
 * 仕様: docs/private/specifications/pro-batch-export.md §2・§4
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { splitFrontmatter } from '../../shared/markdown/frontmatter';
import { buildPdfHtml } from '../../shared/pdfHtml';
import { pdfStylingCss, type PdfStyling } from '../../shared/pdfStyling';
import { commonDirectory, MARKDOWN_FILE, selectMarkdownFiles } from '../../shared/batchExport/fileOrder';
import { planOutputs, type OutputMode, type OverwritePolicy, type PlannedOutput } from '../../shared/batchExport/outputPlan';
import { rewriteImageSources } from '../../shared/batchExport/imagePaths';
import { buildMergedPdfHtml } from '../../shared/batchExport/mergedDocument';
import { runPool, summarizeBatchResults, type BatchResult, type BatchSummary } from '../../shared/batchExport/pool';
import { launchChromePdf, type ChromePdfSession } from './chromePdf';
import { findBrowser, offerToOpen, today } from './localExport';

/** 1 ファイルの印刷の制限時間 */
const PER_FILE_TIMEOUT_MS = 60_000;
/** これより多いと、誤ってワークスペース全体を選んでいないか確かめる */
const LARGE_BATCH = 200;
/** 走査で入らないフォルダ（依存物・Git・VS Code の設定） */
const SKIPPED_DIRS = new Set(['node_modules', '.git']);

export type BatchJob = {
    files: string[];
    /** 相対構成の基準フォルダ */
    root: string;
    credit: boolean;
    styling: PdfStyling;
} & (
    | { kind: 'each'; outputMode: OutputMode; outDir?: string; overwrite: OverwritePolicy }
    | { kind: 'merge'; mergedOutput: string }
);

export interface BatchOutcome {
    /** each: files と同じ順。merge: 1 件 */
    results: BatchResult<string>[];
    /** each のときの出力先の計画 */
    plan: PlannedOutput[];
    summary: BatchSummary;
}

type Progress = vscode.Progress<{ message?: string; increment?: number }>;

/** フォルダ配下の .md を自然順で列挙する（隠しフォルダ・node_modules・シンボリックリンクには入らない） */
export async function listMarkdownFiles(folder: string, recursive: boolean): Promise<string[]> {
    const found: string[] = [];
    const walk = async (dir: string) => {
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (recursive && !entry.name.startsWith('.') && !SKIPPED_DIRS.has(entry.name)) await walk(full);
            } else if (entry.isFile() && MARKDOWN_FILE.test(entry.name)) {
                found.push(full);
            }
        }
    };
    await walk(folder);
    return selectMarkdownFiles(found, folder);
}

/** 開いていて未保存ならエディタの内容、そうでなければファイルの内容（単体書き出しと同じく「見えている内容」） */
async function readMarkdown(file: string): Promise<string> {
    const open = vscode.workspace.textDocuments.find((d) => d.uri.scheme === 'file' && d.uri.fsPath === file);
    return open ? open.getText() : fs.promises.readFile(file, 'utf-8');
}

function readCss(extensionPath: string): string {
    try { return fs.readFileSync(path.join(extensionPath, 'media', 'pdf-export.css'), 'utf-8'); } catch { return ''; }
}

const stem = (file: string) => path.basename(file).replace(MARKDOWN_FILE, '');

export async function runBatchExport(
    job: BatchJob,
    extensionPath: string,
    progress?: Progress,
    token?: vscode.CancellationToken
): Promise<BatchOutcome> {
    const plan = job.kind === 'each'
        ? planOutputs(job.files, {
            root: job.root,
            mode: job.outputMode,
            outDir: job.outDir,
            ext: '.pdf',
            overwrite: job.overwrite,
            existing: new Set(
                planOutputs(job.files, { root: job.root, mode: job.outputMode, outDir: job.outDir, ext: '.pdf', overwrite: 'overwrite', existing: new Set() })
                    .map((p) => p.out)
                    .filter((out) => fs.existsSync(out))
            )
        })
        : [];
    const cancelledAll = (): BatchOutcome => {
        const results: BatchResult<string>[] = job.kind === 'each'
            ? plan.map((p) => (p.action === 'skip' ? { status: 'skipped' } : { status: 'cancelled' }))
            : [{ status: 'cancelled' }];
        return { results, plan, summary: summarizeBatchResults(results) };
    };
    if (token?.isCancellationRequested) return cancelledAll();

    const browser = findBrowser();
    if (!browser) {
        throw new Error(vscode.l10n.t(
            'No Chromium-based browser found (Chrome / Edge / Chromium). ' +
            'Install one or set markdownInline.export.browserPath.'
        ));
    }

    const css = readCss(extensionPath);
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ipreview-batch-'));
    let session: ChromePdfSession | undefined;
    // キャンセルされたら Chrome を閉じる（印刷中の 1 件も止まる。書き出し済みの PDF は消さない）
    const cancelListener = token?.onCancellationRequested(() => { void session?.close(); });
    try {
        session = await launchChromePdf(browser);
        if (token?.isCancellationRequested) return cancelledAll();

        if (job.kind === 'merge') {
            progress?.report({ message: vscode.l10n.t('Building the document…') });
            const docs = await Promise.all(job.files.map(async (file) => ({ path: file, markdown: await readMarkdown(file) })));
            const context = { title: stem(job.mergedOutput), date: today() };
            const html = buildMergedPdfHtml(docs, `${css}\n${pdfStylingCss(job.styling, context)}`, {
                title: context.title,
                tocTitle: vscode.l10n.t('Contents'),
                credit: job.credit
            });
            const htmlPath = path.join(tmpDir, 'book.html');
            await fs.promises.writeFile(htmlPath, html, 'utf-8');
            progress?.report({ message: vscode.l10n.t('Printing…') });
            let result: BatchResult<string>;
            try {
                await session.print(htmlPath, job.mergedOutput, {
                    timeoutMs: Math.max(120_000, job.files.length * 10_000),
                    outline: true
                });
                result = { status: 'done', value: job.mergedOutput };
            } catch (err) {
                result = token?.isCancellationRequested
                    ? { status: 'cancelled' }
                    : { status: 'failed', error: err instanceof Error ? err.message : String(err) };
            }
            return { results: [result], plan, summary: summarizeBatchResults([result]) };
        }

        const toWrite = plan.filter((p) => p.action === 'write');
        const cancelledDuringRun = new Set<number>();
        let finished = 0;
        const written = await runPool(toWrite, 1, async (item, index) => {
            const label = path.relative(job.root, item.src);
            progress?.report({ message: `${finished + 1}/${toWrite.length} ${label}` });
            try {
                const { body } = splitFrontmatter(await readMarkdown(item.src));
                const html = rewriteImageSources(buildPdfHtml(body, css, {
                    credit: job.credit,
                    styling: job.styling,
                    context: { title: stem(item.src), date: today(), tocTitle: vscode.l10n.t('Contents') }
                }), path.dirname(item.src));
                const htmlPath = path.join(tmpDir, `${index}.html`);
                await fs.promises.writeFile(htmlPath, html, 'utf-8');
                await fs.promises.mkdir(path.dirname(item.out), { recursive: true });
                // session は launch 後にしか pool を回さないので必ずある
                await (session as ChromePdfSession).print(htmlPath, item.out, { timeoutMs: PER_FILE_TIMEOUT_MS });
                return item.out;
            } catch (err) {
                if (token?.isCancellationRequested) cancelledDuringRun.add(index);
                throw err;
            } finally {
                finished++;
                progress?.report({ increment: 100 / toWrite.length });
            }
        }, () => token?.isCancellationRequested === true);

        // 計画の順（スキップ込み）に戻す
        let w = 0;
        const results: BatchResult<string>[] = plan.map((p): BatchResult<string> => {
            if (p.action === 'skip') return { status: 'skipped' };
            const index = w++;
            return cancelledDuringRun.has(index) ? { status: 'cancelled' } : written[index];
        });
        return { results, plan, summary: summarizeBatchResults(results) };
    } finally {
        cancelListener?.dispose();
        await session?.close();
        await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
    }
}

// ───────────────────────── コマンド（UI） ─────────────────────────

export interface BatchCommandDeps {
    extensionPath: string;
    /** 前回の選択を覚える（workspaceState） */
    state: vscode.Memento;
    credit: boolean;
    styling: PdfStyling;
}

const STATE_KIND = 'markdownInline.batchExport.kind';
const STATE_OUTPUT = 'markdownInline.batchExport.outputMode';

let outputChannel: vscode.OutputChannel | undefined;
function exportChannel(): vscode.OutputChannel {
    outputChannel ??= vscode.window.createOutputChannel('Markdown Inline Preview: Export');
    return outputChannel;
}

async function isDirectory(p: string): Promise<boolean> {
    try { return (await fs.promises.stat(p)).isDirectory(); } catch { return false; }
}

/** 入口から渡されたもの（エクスプローラの選択／ダイアログで選んだもの）を、対象の .md と基準フォルダにする */
async function resolveTargets(picked: vscode.Uri[]): Promise<{ files: string[]; root: string; folderOnly: string | undefined } | undefined> {
    const paths = picked.filter((u) => u.scheme === 'file').map((u) => u.fsPath);
    if (paths.length === 0) return undefined;
    const folders: string[] = [];
    for (const p of paths) if (await isDirectory(p)) folders.push(p);
    const root = commonDirectory(paths, folders);

    // フォルダを選んだときだけ「サブフォルダも含めるか」を聞く（サブフォルダに .md があるときだけ）
    let recursive = true;
    if (folders.length > 0) {
        const shallow = (await Promise.all(folders.map((f) => listMarkdownFiles(f, false)))).flat();
        const deep = (await Promise.all(folders.map((f) => listMarkdownFiles(f, true)))).flat();
        if (deep.length > shallow.length) {
            const include = vscode.l10n.t('Include subfolders (+{0} files)', deep.length - shallow.length);
            const only = vscode.l10n.t('This folder only ({0} files)', shallow.length);
            const choice = await vscode.window.showQuickPick([include, only], {
                title: vscode.l10n.t('Batch Export'),
                placeHolder: vscode.l10n.t('Include Markdown files in subfolders?')
            });
            if (!choice) return undefined;
            recursive = choice === include;
        }
    }
    const listed = (await Promise.all(folders.map((f) => listMarkdownFiles(f, recursive)))).flat();
    const files = selectMarkdownFiles([...paths.filter((p) => !folders.includes(p)), ...listed], root);
    return { files, root, folderOnly: folders.length === 1 && paths.length === 1 ? folders[0] : undefined };
}

async function pickEntry(): Promise<vscode.Uri[] | undefined> {
    return vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: true,
        canSelectMany: true,
        defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri,
        filters: { Markdown: ['md', 'markdown'] },
        openLabel: vscode.l10n.t('Batch Export')
    });
}

/** 既存の PDF があるときだけ、どうするかを聞く。キャンセルなら undefined */
async function askOverwrite(existingCount: number): Promise<OverwritePolicy | undefined> {
    const overwrite = vscode.l10n.t('Overwrite');
    const skip = vscode.l10n.t('Skip Existing');
    const rename = vscode.l10n.t('Save with New Names');
    const choice = await vscode.window.showWarningMessage(
        vscode.l10n.t('{0} PDF files already exist in the destination.', existingCount),
        { modal: true },
        overwrite, skip, rename
    );
    if (choice === overwrite) return 'overwrite';
    if (choice === skip) return 'skip';
    if (choice === rename) return 'rename';
    return undefined;
}

export async function runBatchExportCommand(
    clicked: vscode.Uri | undefined,
    selected: vscode.Uri[] | undefined,
    deps: BatchCommandDeps
): Promise<void> {
    const entry = selected && selected.length > 0 ? selected : clicked ? [clicked] : await pickEntry();
    if (!entry) return;
    const targets = await resolveTargets(entry);
    if (!targets) return;
    const { root } = targets;
    let { files } = targets;
    if (files.length === 0) {
        void vscode.window.showInformationMessage(vscode.l10n.t('No Markdown files found.'));
        return;
    }
    if (files.length > LARGE_BATCH) {
        const go = vscode.l10n.t('Continue');
        const choice = await vscode.window.showWarningMessage(
            vscode.l10n.t('Export {0} files?', files.length), { modal: true }, go);
        if (choice !== go) return;
    }

    // [1] 書き出し方（前回の選択を先頭に）
    const eachLabel = vscode.l10n.t('One PDF per file ({0} files)', files.length);
    const mergeLabel = vscode.l10n.t('Combine into one PDF');
    const kinds = [
        { label: eachLabel, exportKind: 'each' as const },
        { label: mergeLabel, exportKind: 'merge' as const }
    ];
    if (deps.state.get(STATE_KIND) === 'merge') kinds.reverse();
    const kindPick = await vscode.window.showQuickPick(kinds, { title: vscode.l10n.t('Batch Export') });
    if (!kindPick) return;
    await deps.state.update(STATE_KIND, kindPick.exportKind);

    let job: BatchJob;
    if (kindPick.exportKind === 'merge') {
        // [3b] 入れるファイルと順番（外したものは入れない）
        const items = files.map((f) => ({ label: path.relative(root, f), picked: true, file: f }));
        const chosen = await vscode.window.showQuickPick(items, {
            title: vscode.l10n.t('Files to combine (in this order)'),
            canPickMany: true
        });
        if (!chosen || chosen.length === 0) return;
        const keep = new Set(chosen.map((c) => c.file));
        files = files.filter((f) => keep.has(f));
        const target = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(path.join(root, `${path.basename(root)}.pdf`)),
            filters: { PDF: ['pdf'] }
        });
        if (!target) return;
        job = { kind: 'merge', files, root, mergedOutput: target.fsPath, credit: deps.credit, styling: deps.styling };
    } else {
        // [3a] 出力先
        const beside = { label: vscode.l10n.t('Next to each file'), mode: 'beside' as const };
        const folder = { label: vscode.l10n.t('Choose a folder… (keeps the folder structure)'), mode: 'folder' as const };
        const outputs = deps.state.get(STATE_OUTPUT) === 'folder' ? [folder, beside] : [beside, folder];
        const outPick = await vscode.window.showQuickPick(outputs, { title: vscode.l10n.t('Where to save the PDFs') });
        if (!outPick) return;
        await deps.state.update(STATE_OUTPUT, outPick.mode);
        let outDir: string | undefined;
        if (outPick.mode === 'folder') {
            const picked = await vscode.window.showOpenDialog({
                canSelectFiles: false, canSelectFolders: true, canSelectMany: false,
                defaultUri: vscode.Uri.file(root), openLabel: vscode.l10n.t('Save Here')
            });
            if (!picked?.[0]) return;
            outDir = picked[0].fsPath;
        }
        // [4] 既存ファイル（あるときだけ）
        const existing = planOutputs(files, { root, mode: outPick.mode, outDir, ext: '.pdf', overwrite: 'overwrite', existing: new Set() })
            .filter((p) => fs.existsSync(p.out)).length;
        let overwrite: OverwritePolicy = 'overwrite';
        if (existing > 0) {
            const policy = await askOverwrite(existing);
            if (!policy) return;
            overwrite = policy;
        }
        job = { kind: 'each', files, root, outputMode: outPick.mode, outDir, overwrite, credit: deps.credit, styling: deps.styling };
    }

    let outcome: BatchOutcome;
    try {
        outcome = await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: vscode.l10n.t('Exporting {0} files…', job.files.length),
            cancellable: true
        }, (progress, token) => runBatchExport(job, deps.extensionPath, progress, token));
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        void vscode.window.showErrorMessage(vscode.l10n.t('Batch export failed: {0}', msg));
        return;
    }
    void reportOutcome(job, outcome);
}

/** 結果の通知。失敗の詳細は出力チャネルへ 1 行ずつ */
async function reportOutcome(job: BatchJob, outcome: BatchOutcome): Promise<void> {
    const { summary, results } = outcome;
    const failures = results.flatMap((r, i) => {
        if (r.status !== 'failed') return [];
        const file = job.kind === 'merge' ? path.basename(job.mergedOutput) : path.relative(job.root, job.files[i]);
        return [`${file} — ${r.error}`];
    });
    if (failures.length > 0) {
        const channel = exportChannel();
        channel.appendLine(`[${new Date().toLocaleString()}] ${vscode.l10n.t('Batch export')}`);
        for (const line of failures) channel.appendLine(vscode.l10n.t('Failed: {0}', line));
    }

    if (job.kind === 'merge') {
        const [result] = results;
        if (result.status === 'done') {
            void offerToOpen(job.mergedOutput, vscode.l10n.t('Combined {0} files into {1}', job.files.length, path.basename(job.mergedOutput)));
        } else if (result.status === 'failed') {
            void vscode.window.showErrorMessage(vscode.l10n.t('Batch export failed: {0}', result.error));
        } else {
            void vscode.window.showInformationMessage(vscode.l10n.t('Batch export cancelled.'));
        }
        return;
    }

    let message: string;
    if (summary.cancelled > 0) {
        message = vscode.l10n.t('Cancelled ({0} of {1} files exported).', summary.done, summary.total);
    } else if (summary.failed > 0 || summary.skipped > 0) {
        message = vscode.l10n.t('Exported {0} of {1} files (failed: {2}, skipped: {3}).',
            summary.done, summary.total, summary.failed, summary.skipped);
    } else {
        message = vscode.l10n.t('Exported {0} PDF files.', summary.done);
    }
    const openFolder = vscode.l10n.t('Open Folder');
    const details = vscode.l10n.t('Details');
    const buttons = summary.failed > 0 ? [details, openFolder] : [openFolder];
    const show = summary.failed > 0 ? vscode.window.showWarningMessage : vscode.window.showInformationMessage;
    const choice = await show(message, ...buttons);
    if (choice === details) exportChannel().show(true);
    if (choice === openFolder) {
        const firstOut = outcome.plan.find((_, i) => results[i].status === 'done')?.out;
        const dir = job.outputMode === 'folder' && job.outDir ? job.outDir : firstOut ? path.dirname(firstOut) : job.root;
        await vscode.env.openExternal(vscode.Uri.file(dir));
    }
}
