import * as assert from 'assert';
import {
    resolveAutoTableFormattingEnabled,
    resolvePreviewEnabled,
    resolveImageThumbnailEnabled
} from '../../../src/core/markdownInlineSettings';
import type { ConfigLike } from '../../../src/core/config';

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

    // ── Raw インライン画像サムネイル（imagePreview.showThumbnail）──────────────
    // 既定 off。サムネイルは編集の邪魔になるため既定では隠す（ホバープレビューは別設定で残る）。
    describe('resolveImageThumbnailEnabled', () => {
        it('既定では off（サムネイルを隠す）', () => {
            assert.strictEqual(resolveImageThumbnailEnabled(createConfig({})), false);
        });

        it('showThumbnail=true を明示したときだけ on', () => {
            const config = createConfig({ 'imagePreview.showThumbnail': true });
            assert.strictEqual(resolveImageThumbnailEnabled(config), true);
        });

        it('imagePreview.enabled=false なら showThumbnail=true でも off', () => {
            const config = createConfig({
                'imagePreview.enabled': false,
                'imagePreview.showThumbnail': true
            });
            assert.strictEqual(resolveImageThumbnailEnabled(config), false);
        });

        it('preview 機能自体が無効なら off', () => {
            const config = createConfig({
                'enablePreview': false,
                'imagePreview.showThumbnail': true
            });
            assert.strictEqual(resolveImageThumbnailEnabled(config), false);
        });
    });
});
