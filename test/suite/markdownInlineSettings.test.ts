import * as assert from 'assert';
import {
    resolveAutoTableFormattingEnabled,
    resolveHideStrikethroughOnEditingLine,
    resolvePreviewEnabled
} from '../../src/core/markdownInlineSettings';
import type { ConfigLike } from '../../src/core/config';

function createConfig(values: Record<string, unknown>): ConfigLike {
    return {
        get<T>(section: string, defaultValue?: T): T {
            const value = values[section];
            if (value !== undefined) {
                return value as T;
            }
            if (defaultValue !== undefined) {
                return defaultValue;
            }
            throw new Error(`Missing config value for ${section}`);
        },
        inspect<T>(section: string) {
            if (!Object.prototype.hasOwnProperty.call(values, section)) {
                return undefined;
            }
            return { workspaceValue: values[section] as T };
        }
    };
}

describe('markdownInlineSettings', () => {
    it('resolves preview enabled with default true', () => {
        assert.strictEqual(resolvePreviewEnabled(createConfig({})), true);
    });

    it('respects slash table normalize override', () => {
        const config = createConfig({ 'advanced.autoFormatTables': false });
        assert.strictEqual(resolveAutoTableFormattingEnabled(config, true), true);
        assert.strictEqual(resolveAutoTableFormattingEnabled(config, false), false);
        assert.strictEqual(resolveAutoTableFormattingEnabled(config, null), false);
    });

    it('hides strikethrough only on the current editing line', () => {
        const config = createConfig({ hideStrikethroughOnEdit: true });
        assert.strictEqual(resolveHideStrikethroughOnEditingLine(config, 4, 4), true);
        assert.strictEqual(resolveHideStrikethroughOnEditingLine(config, 3, 4), false);
    });
});
