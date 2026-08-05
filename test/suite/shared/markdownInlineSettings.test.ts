import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import {
    resolveAutoTableFormattingEnabled,
    resolvePreviewEnabled,
    resolveImageThumbnailEnabled,
    resolveShowLineNumbers
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

    // ── Preview 行番号ガター（preview.showLineNumbers）──────────────
    // 既定 on。Raw モードでは VS Code 本体の行番号が常に左に見えるのに、Live へ
    // 切り替えた途端に行番号が消えると「機能が消えた」ように見えるため、既定で表示して
    // Raw との見た目の一貫性を保つ。不要なユーザーは設定で off にできる。
    describe('resolveShowLineNumbers', () => {
        it('既定では on（Live でもソース行番号を表示する）', () => {
            assert.strictEqual(resolveShowLineNumbers(createConfig({})), true);
        });

        it('showLineNumbers=false を明示したときは off', () => {
            const config = createConfig({ 'live.showLineNumbers': false });
            assert.strictEqual(resolveShowLineNumbers(config), false);
        });

        it('package.json の contributes 既定値も on（resolve 側の既定とズレない）', () => {
            // コンパイル後は out-test/ 配下から実行されるため、__dirname ではなく
            // リポジトリ直下（mocha の実行 cwd）から package.json を読む。
            const pkg = JSON.parse(
                fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8')
            );
            const decl = pkg.contributes.configuration.properties['markdownInline.live.showLineNumbers'];
            assert.strictEqual(decl.default, true);
        });
    });
});
