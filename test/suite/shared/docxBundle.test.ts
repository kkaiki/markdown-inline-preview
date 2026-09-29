/**
 * Word 書き出し用の別バンドル（`out/docxExport.js`、`scripts/build-lazy-bundles.mjs` が作る）を検査する。
 *
 * `docx` を拡張本体に入れると起動のたびに約 800 KB を読むので、書き出し時にだけ require する別ファイルにする
 * （設計: docs/private/specifications/pro-docx-export.md §4.2）。依存の更新で静かに太ったら気づけるよう上限を置く。
 * `npm run compile` の後に実行する前提。
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

const repoRoot = (() => {
    let dir = __dirname;
    while (!fs.existsSync(path.join(dir, 'package.json'))) dir = path.dirname(dir);
    return dir;
})();
const BUNDLE = path.join(repoRoot, 'out', 'docxExport.js');

describe('Word 書き出し用の別バンドル（out/docxExport.js）', () => {
    it('ビルドされている（拡張の起動時には読まず、書き出し時に読む）', () => {
        assert.ok(fs.existsSync(BUNDLE), `${BUNDLE} が無い（npm run build:lazy）`);
    });

    it('800 KB を超えない', () => {
        const size = fs.statSync(BUNDLE).size;
        assert.ok(size < 800 * 1024, `${(size / 1024).toFixed(0)} KB`);
    });

    it('exportDocx を公開している', () => {
        const mod = require(BUNDLE) as { exportDocx?: unknown };
        assert.strictEqual(typeof mod.exportDocx, 'function');
    });
});
