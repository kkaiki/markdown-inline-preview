export {
    getAdvancedBooleanSetting,
    getAdvancedOrLegacyBooleanSetting
} from './config';
export type { ConfigInspection, ConfigLike } from './config';
export {
    resolveAlwaysOpenNewTab,
    resolveAutoTableFormattingEnabled,
    resolveCheckboxMouseToggleEnabled,
    resolveCodeBlockAutoCompleteEnabled,
    resolveCodeBlockDecorationsEnabled,
    resolveDefaultWordWrap,
    resolveDisableCompetingMarkdownFeatures,
    resolveHeadingDecorationsEnabled,
    resolveHorizontalRuleDecorationsEnabled,
    resolveImageHoverPreviewEnabled,
    resolveImageThumbnailEnabled,
    resolvePreviewEnabled,
    resolveShowCheckboxCodeLensEnabled,
    resolveShowLineNumbers,
    resolveTableWrapHoverEnabled,
    resolveTableWrapMaxWidth,
    resolveWrapTabs
} from './markdownInlineSettings';
export { rawRuntime, clearRuntimeTimers } from './runtime';
export { debugLog } from './debug';
