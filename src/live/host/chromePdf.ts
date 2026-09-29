/**
 * Chrome を 1 回だけ起動し、DevTools プロトコル（--remote-debugging-pipe）で HTML → PDF を繰り返す。
 *
 * まとめて書き出し（PRO+）用。1 ファイルごとに `--print-to-pdf` で起動し直すと、起動コストがファイル数ぶん掛かり、
 * `execFile` の timeout ではハングした Chrome を止め切れないことがある（設計書 §7）。ここでは
 *   - 印刷ごとに別のブラウザコンテキスト（別プロセス）を作って捨てる（終わらないページが次に波及しない）
 *   - タイムアウトはファイル単位
 *   - 閉じるときは Browser.close → 5 秒待って SIGKILL → 一時プロファイルを消す
 * VS Code API には依存しない（実 Chrome のテスト test/browser/live/rendering/pdfBatch.test.ts から直接使う）。
 * 仕様: docs/private/specifications/pro-batch-export.md §4.2
 */
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { pathToFileURL } from 'url';
import type { Readable, Writable } from 'stream';

export interface PrintOptions {
    /** このファイル 1 件の制限時間 */
    timeoutMs: number;
    /** 見出しから PDF のしおりを作る */
    outline?: boolean;
}

export interface ChromePdfSession {
    /** HTML ファイルを印刷して pdfPath に書く。出力先フォルダは呼び出し側が作っておく */
    print(htmlPath: string, pdfPath: string, options: PrintOptions): Promise<void>;
    close(): Promise<void>;
    /** 一時プロファイル（閉じると消える） */
    readonly profileDir: string;
}

interface CdpMessage {
    id?: number;
    method?: string;
    sessionId?: string;
    params?: Record<string, unknown>;
    result?: Record<string, unknown>;
    error?: { message: string };
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export async function launchChromePdf(
    browserPath: string,
    options: { launchTimeoutMs?: number } = {}
): Promise<ChromePdfSession> {
    // 普段の Chrome プロファイルに触れないよう、必ず一時プロファイルで起動する
    const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ipreview-chrome-'));
    const proc = spawn(browserPath, [
        '--headless=new',
        '--disable-gpu',
        '--remote-debugging-pipe',
        `--user-data-dir=${profileDir}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--use-mock-keychain',
        'about:blank'
    ], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
    const toChrome = proc.stdio[3] as Writable;
    const fromChrome = proc.stdio[4] as Readable;

    let nextId = 0;
    let exitError: Error | undefined;
    const pending = new Map<number, { resolve: (r: Record<string, unknown>) => void; reject: (e: Error) => void }>();
    const listeners = new Set<(msg: CdpMessage) => void>();

    const fail = (err: Error) => {
        exitError ??= err;
        for (const p of pending.values()) p.reject(exitError);
        pending.clear();
    };
    const exited = new Promise<void>((resolve) => {
        proc.once('exit', () => { fail(new Error('Chrome exited')); resolve(); });
        proc.once('error', (err) => { fail(err); resolve(); });
    });
    toChrome.on('error', () => { /* 終了後の書き込み（EPIPE）は exit 側で扱う */ });
    fromChrome.on('error', () => { /* 同上 */ });

    // メッセージは NUL 区切りの JSON。マルチバイト文字がチャンク境界で切れないよう Buffer のまま区切る
    let buffered = Buffer.alloc(0);
    fromChrome.on('data', (chunk: Buffer) => {
        buffered = Buffer.concat([buffered, chunk]);
        let end: number;
        while ((end = buffered.indexOf(0)) >= 0) {
            const msg = JSON.parse(buffered.subarray(0, end).toString('utf8')) as CdpMessage;
            buffered = buffered.subarray(end + 1);
            const waiter = msg.id !== undefined ? pending.get(msg.id) : undefined;
            if (waiter && msg.id !== undefined) {
                pending.delete(msg.id);
                if (msg.error) waiter.reject(new Error(msg.error.message));
                else waiter.resolve(msg.result ?? {});
            } else {
                for (const l of listeners) l(msg);
            }
        }
    });

    const send = (method: string, params: Record<string, unknown> = {}, sessionId?: string) =>
        new Promise<Record<string, unknown>>((resolve, reject) => {
            if (exitError) { reject(exitError); return; }
            const id = ++nextId;
            pending.set(id, { resolve, reject });
            toChrome.write(`${JSON.stringify({ id, method, params, sessionId })}\0`);
        });

    /** 先に登録しておき、起きたら解決する（取りこぼさないよう navigate より前に呼ぶ） */
    const waitEvent = (method: string, sessionId: string) => {
        let listener!: (msg: CdpMessage) => void;
        const promise = new Promise<void>((resolve) => {
            listener = (msg) => {
                if (msg.method === method && msg.sessionId === sessionId) resolve();
            };
            listeners.add(listener);
        });
        return { promise, dispose: () => listeners.delete(listener) };
    };

    let closed = false;
    const close = async () => {
        if (closed) return;
        closed = true;
        if (!exitError) {
            void send('Browser.close').catch(() => undefined);
            await withTimeout(exited, 5000, 'close').catch(() => undefined);
        }
        if (proc.exitCode === null && proc.signalCode === null) {
            proc.kill('SIGKILL');
            await withTimeout(exited, 5000, 'kill').catch(() => undefined);
        }
        fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    };

    try {
        await withTimeout(send('Browser.getVersion'), options.launchTimeoutMs ?? 30_000, 'Timed out starting Chrome');
    } catch (err) {
        await close();
        throw err;
    }

    const print = async (htmlPath: string, pdfPath: string, printOptions: PrintOptions) => {
        if (closed || exitError) throw exitError ?? new Error('Chrome is closed');
        const { browserContextId } = await send('Target.createBrowserContext', { disposeOnDetach: true });
        let load: ReturnType<typeof waitEvent> | undefined;
        try {
            const job = async () => {
                const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId });
                const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true }) as { sessionId: string };
                await send('Page.enable', {}, sessionId);
                load = waitEvent('Page.loadEventFired', sessionId);
                const nav = await send('Page.navigate', { url: pathToFileURL(htmlPath).href }, sessionId);
                if (typeof nav.errorText === 'string') throw new Error(`${nav.errorText}: ${htmlPath}`);
                await load.promise;
                const { data } = await send('Page.printToPDF', {
                    // CLI の --print-to-pdf --no-pdf-header-footer と同じ見た目にする
                    printBackground: true,
                    preferCSSPageSize: true,
                    displayHeaderFooter: false,
                    generateDocumentOutline: printOptions.outline === true
                }, sessionId) as { data: string };
                return Buffer.from(data, 'base64');
            };
            const pdf = await withTimeout(job(), printOptions.timeoutMs,
                `Timed out after ${Math.round(printOptions.timeoutMs / 1000)} s`);
            await fs.promises.writeFile(pdfPath, pdf);
        } finally {
            load?.dispose();
            // コンテキストごと捨てると、そのページのレンダラーも終わる（無限ループ中のページも残らない）
            await withTimeout(send('Target.disposeBrowserContext', { browserContextId }), 10_000, 'dispose')
                .catch(() => undefined);
        }
    };

    return { print, close, profileDir };
}
