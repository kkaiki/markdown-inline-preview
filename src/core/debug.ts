import { rawRuntime } from './runtime';

export function debugLog(message: string, ...args: unknown[]): void {
    if (!rawRuntime.debugChannel) return;
    const timestamp = new Date().toISOString().substring(11, 23);
    const formattedArgs = args.length > 0 ? ' ' + args.map(a => JSON.stringify(a)).join(' ') : '';
    rawRuntime.debugChannel.appendLine(`[${timestamp}] ${message}${formattedArgs}`);
}
