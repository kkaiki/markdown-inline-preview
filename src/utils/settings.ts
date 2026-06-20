/**
 * 設定ヘルパー
 * Advanced設定の解決とレガシー設定との後方互換を扱う
 */

export interface ConfigInspection<T> {
    globalValue?: T;
    workspaceValue?: T;
    workspaceFolderValue?: T;
}

export interface ConfigLike {
    get<T>(section: string, defaultValue?: T): T;
    inspect?<T>(section: string): ConfigInspection<T> | undefined;
}

function hasExplicitValue<T>(inspection: ConfigInspection<T> | undefined): boolean {
    if (!inspection) {
        return false;
    }

    return inspection.globalValue !== undefined
        || inspection.workspaceValue !== undefined
        || inspection.workspaceFolderValue !== undefined;
}

export function getAdvancedBooleanSetting(
    config: ConfigLike,
    key: string,
    defaultValue: boolean
): boolean {
    return config.get<boolean>(`advanced.${key}`, defaultValue);
}

export function getAdvancedOrLegacyBooleanSetting(
    config: ConfigLike,
    advancedKey: string,
    legacyKey: string,
    defaultValue: boolean
): boolean {
    const inspection = config.inspect?.<boolean>(`advanced.${advancedKey}`);
    if (hasExplicitValue(inspection)) {
        return config.get<boolean>(`advanced.${advancedKey}`, defaultValue);
    }

    return config.get<boolean>(legacyKey, defaultValue);
}
