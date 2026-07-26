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
        // 既定 false: Raw モードのインライン画像サムネイルは編集の邪魔になるため既定で隠す
        // （ホバープレビューは imagePreview.enabled 側で引き続き利用できる）。
        config.get<boolean>('imagePreview.showThumbnail', false)
    );
}

export function resolveTableWrapMaxWidth(config: ConfigLike): number {
    return config.get<number>('table.inlineWrap.maxWidth', 24);
}

export function resolveAlwaysOpenNewTab(config: ConfigLike): boolean {
    return config.get<boolean>('preview.alwaysOpenNewTab', true);
}

// 既定 on。`.md` の既定エディタ（workbench.editorAssociations）を現在のモードへ
// 追従させることで、Raw モードでも Preview の Custom Editor が一度生成されてから
// 跳ね返る過渡状態を無くし、同じパターンに priority: "default" を主張する他拡張との
// 競合も解消する。グローバル設定を拡張機能が書き換えるため、オプトアウトできる。
// 詳細: docs/specifications/default-editor-association-sync.md
export function resolveControlDefaultEditor(config: ConfigLike): boolean {
    return config.get<boolean>('preview.controlDefaultEditor', true);
}

export function resolveDefaultWordWrap(config: ConfigLike): boolean {
    return config.get<boolean>('preview.wordWrap', true);
}

export function resolveWrapTabs(config: ConfigLike): boolean {
    return config.get<boolean>('preview.wrapTabs', true);
}

// 既定 on。Raw モードでは VS Code 本体の行番号が常に左に見えるため、Preview に
// 切り替えた瞬間に行番号が消えると「機能が消えた」ように見える。既定で表示して
// Raw との見た目の一貫性を保つ（不要なら設定で off にできる）。
export function resolveShowLineNumbers(config: ConfigLike): boolean {
    return config.get<boolean>('preview.showLineNumbers', true);
}
