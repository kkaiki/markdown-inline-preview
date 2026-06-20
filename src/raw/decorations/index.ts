export { setRawDecorationDeps } from './deps';
export type { RawDecorationDeps } from './deps';
export { rawDecorationState } from './state';
export type { CodeBlock } from './state';
export { createRawDecorations, rebuildHeadingDecorations, disposeRawDecorations } from './factory';
export {
    updateAllDecorations,
    clearAllDecorations,
    clearInlineEmphasisDecorations,
    updateHeadingDecorations,
    updateCodeBlockDecorations,
    updateHorizontalRuleDecorations
} from './updaters';
export { createHeadingDecorations, resolveHeadingColorScheme } from './headingSchemes';
export { updateImageInlineDecorations } from './imageInline';
export { updateTableWrapInlineDecorations } from './tableWrapInline';
