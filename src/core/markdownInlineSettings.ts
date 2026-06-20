import {
    getAdvancedBooleanSetting,
    getAdvancedOrLegacyBooleanSetting,
    type ConfigLike
} from './config';

export function resolvePreviewEnabled(config: ConfigLike): boolean {
    return config.get<boolean>('enablePreview', true);
}

export function resolveAutoTableFormattingEnabled(
    config: ConfigLike,
    slashTableNormalizeOverride: boolean | null
): boolean {
    if (slashTableNormalizeOverride !== null) {
        return slashTableNormalizeOverride;
    }
    return getAdvancedBooleanSetting(config, 'autoFormatTables', false);
}

export function resolveCheckboxMouseToggleEnabled(config: ConfigLike): boolean {
    return getAdvancedBooleanSetting(config, 'enableCheckboxMouseToggle', true);
}

export function resolveCodeBlockAutoCompleteEnabled(config: ConfigLike): boolean {
    return getAdvancedBooleanSetting(config, 'enableCodeBlockAutoComplete', true);
}

export function resolveHeadingDecorationsEnabled(config: ConfigLike): boolean {
    return getAdvancedOrLegacyBooleanSetting(
        config,
        'enableHeadingDecorations',
        'enableHeadingDecorations',
        true
    );
}

export function resolveCodeBlockDecorationsEnabled(config: ConfigLike): boolean {
    return getAdvancedBooleanSetting(config, 'enableCodeBlockDecorations', true);
}

export function resolveHorizontalRuleDecorationsEnabled(config: ConfigLike): boolean {
    return getAdvancedBooleanSetting(config, 'enableHorizontalRuleDecorations', true);
}

export function resolveDisableCompetingMarkdownFeatures(config: ConfigLike): boolean {
    return getAdvancedBooleanSetting(config, 'disableCompetingMarkdownFeatures', true);
}

export function resolveHideStrikethroughOnEditingLine(
    config: ConfigLike,
    line: number,
    currentEditingLine: number
): boolean {
    return config.get<boolean>('hideStrikethroughOnEdit', true) && line === currentEditingLine;
}

export function resolveShowCheckboxCodeLensEnabled(config: ConfigLike): boolean {
    return config.get<boolean>('showCheckboxCodeLens', true);
}

export function resolveImageHoverPreviewEnabled(config: ConfigLike): boolean {
    return resolvePreviewEnabled(config) && config.get<boolean>('imagePreview.enabled', true);
}

export function resolveTableWrapHoverEnabled(config: ConfigLike): boolean {
    return config.get<boolean>('table.inlineWrap.enabled', true);
}

export function resolveImageThumbnailEnabled(config: ConfigLike): boolean {
    return (
        resolvePreviewEnabled(config) &&
        config.get<boolean>('imagePreview.enabled', true) &&
        config.get<boolean>('imagePreview.showThumbnail', true)
    );
}

export function resolveTableWrapMaxWidth(config: ConfigLike): number {
    return config.get<number>('table.inlineWrap.maxWidth', 24);
}
