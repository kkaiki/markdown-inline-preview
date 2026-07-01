export interface RawDecorationDeps {
    isPreviewEnabled: () => boolean;
    isHeadingDecorationsEnabled: () => boolean;
    isCodeBlockDecorationsEnabled: () => boolean;
    isHorizontalRuleDecorationsEnabled: () => boolean;
    isImageThumbnailEnabled: () => boolean;
    isTableWrapHoverEnabled: () => boolean;
    getTableWrapMaxWidth: () => number;
    debugLog: (message: string, ...args: unknown[]) => void;
}

let deps: RawDecorationDeps | null = null;

export function setRawDecorationDeps(next: RawDecorationDeps): void {
    deps = next;
}

export function getRawDecorationDeps(): RawDecorationDeps {
    if (!deps) {
        throw new Error('RawDecorationDeps is not initialized');
    }
    return deps;
}
