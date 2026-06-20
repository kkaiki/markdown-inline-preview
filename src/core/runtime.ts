import type * as vscode from 'vscode';

export const rawRuntime = {
    updateTimer: null as ReturnType<typeof setTimeout> | null,
    slashTableNormalizeOverride: null as boolean | null,
    isDragging: false,
    debugChannel: null as vscode.OutputChannel | null
};

export function clearRuntimeTimers(): void {
    if (rawRuntime.updateTimer) {
        clearTimeout(rawRuntime.updateTimer);
        rawRuntime.updateTimer = null;
    }
}
