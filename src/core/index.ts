export {
    getAdvancedBooleanSetting,
    getAdvancedOrLegacyBooleanSetting
} from './config';
export type { ConfigInspection, ConfigLike } from './config';
export {
    resolveAutoTableFormattingEnabled,
    resolveCheckboxMouseToggleEnabled,
    resolveCodeBlockAutoCompleteEnabled,
    resolveCodeBlockDecorationsEnabled,
    resolveDisableCompetingMarkdownFeatures,
    resolveHeadingDecorationsEnabled,
    resolveHorizontalRuleDecorationsEnabled,
    resolveImageHoverPreviewEnabled,
    resolveImageThumbnailEnabled,
    resolvePreviewEnabled,
    resolveShowCheckboxCodeLensEnabled,
    resolveTableWrapHoverEnabled,
    resolveTableWrapMaxWidth
} from './markdownInlineSettings';
export { rawRuntime, clearRuntimeTimers } from './runtime';
export { debugLog } from './debug';
