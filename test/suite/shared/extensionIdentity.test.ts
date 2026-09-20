/**
 * 拡張の ID（`publisher.name`）が、Marketplace / Open VSX で**すでに公開されている ID** と一致していること。
 *
 * 2026-06-20 に ID を `ipreview.ipreview` へ変えたまま公開に進むと、既存の公開版
 * （`markdown-inline-preview.markdown-inline-preview`。Open VSX 約 8 万 DL）には更新が届かず、
 * 別の新規拡張として出てしまう（2026-09-20 に発覚。docs/private/release-readiness-2026-09-20.md）。
 * ID は公開後に変えられないので、`package.json` とライセンスの deep link が食い違わないことも固定する。
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { EXTENSION_ID } from '../../../src/shared/license/activationUri';

const PUBLISHED_EXTENSION_ID = 'markdown-inline-preview.markdown-inline-preview';

const repoRoot = (() => {
    let dir = __dirname;
    while (!fs.existsSync(path.join(dir, 'package.json'))) dir = path.dirname(dir);
    return dir;
})();

const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')) as {
    name: string;
    publisher: string;
};

describe('拡張の ID（公開済みの拡張を更新できること）', () => {
    it('package.json の publisher.name は公開済みの ID と一致する', () => {
        assert.strictEqual(`${pkg.publisher}.${pkg.name}`, PUBLISHED_EXTENSION_ID);
    });

    it('ライセンスの deep link に使う EXTENSION_ID は package.json の publisher.name と一致する', () => {
        assert.strictEqual(EXTENSION_ID, `${pkg.publisher}.${pkg.name}`);
    });
});
