/**
 * Marp スライド書き出し用の別バンドル（`out/marp.js`、`scripts/build-marp.mjs` が作る）を検査する。
 *
 * marp-core をそのままバンドルすると MathJax と highlight.js の全言語を抱えて 3.9 MB（zip 後 1.2 MB）になる。
 * 設計（docs/private/specifications/pro-marp-export.md §2・R2）どおり MathJax を外し、言語を絞って
 * 1.1 MB 前後に収める。marp-core の更新でスリム化が静かに効かなくなったときに気づけるよう、上限を置く。
 * `npm run compile`（CI・pre-commit 前のビルド）の後に実行する前提。
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

const repoRoot = (() => {
    let dir = __dirname;
    while (!fs.existsSync(path.join(dir, 'package.json'))) dir = path.dirname(dir);
    return dir;
})();
const BUNDLE = path.join(repoRoot, 'out', 'marp.js');

describe('Marp 用の別バンドル（out/marp.js）', () => {
    it('ビルドされている（拡張の起動時には読まず、書き出し時に読む）', () => {
        assert.ok(fs.existsSync(BUNDLE), `${BUNDLE} が無い（npm run build:marp）`);
    });

    it('1.5 MB を超えない（MathJax・不要な言語を外したまま）', () => {
        const size = fs.statSync(BUNDLE).size;
        assert.ok(size < 1.5 * 1024 * 1024, `${(size / 1024).toFixed(0)} KB`);
    });

    it('MathJax を含まない（数式は同梱の KaTeX で描く）', () => {
        assert.ok(!fs.readFileSync(BUNDLE, 'utf8').includes('mathjax-full'), 'mathjax-full が入っている');
    });

    it('buildMarpHtml を公開している', () => {
        const mod = require(BUNDLE) as { buildMarpHtml?: unknown };
        assert.strictEqual(typeof mod.buildMarpHtml, 'function');
    });
});
