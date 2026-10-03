/**
 * `markdownInline.license.serverUrl` の設定スコープを固定する。
 *
 * ワークスペース（`.vscode/settings.json`）で上書きできると、悪意ある repo を開いただけで
 * 起動時の静かな更新が保存済みライセンスキーをそのサーバーへ送ってしまう。
 * 利用者自身のマシン設定でしか変えられない（scope: machine）ことを、層が違っても外せない形で固定する。
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

describe('license.serverUrl の設定スコープ', () => {
    it('ワークスペース設定では上書きできない（machine スコープ）', () => {
        const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../../package.json'), 'utf-8'));
        const prop = pkg.contributes.configuration.properties['markdownInline.license.serverUrl'];
        assert.ok(prop, 'serverUrl の設定が見つからない');
        assert.strictEqual(prop.scope, 'machine');
    });
});
