/**
 * `package.json` の表示文字列（コマンド名・設定の説明）が多言語化されていること。
 *
 * ユーザー指示（2026-09-12）:「エディタの設定に従い、基本的には英語にしつつ、
 * 日本語の時は日本語に対応するようにしてほしい」。
 * VS Code は `package.nls.json`（既定＝英語）と `package.nls.ja.json`（日本語）で
 * `%key%` を差し替える。日本語をベタ書きすると英語環境でも日本語が出てしまう。
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

const repoRoot = (() => {
    let dir = __dirname;
    while (!fs.existsSync(path.join(dir, 'package.json'))) dir = path.dirname(dir);
    return dir;
})();

function readJson(name: string): Record<string, unknown> {
    return JSON.parse(fs.readFileSync(path.join(repoRoot, name), 'utf8')) as Record<string, unknown>;
}

/** 日本語（かな・カナ・漢字）を含むか。 */
const hasJapanese = (s: string): boolean => /[぀-ヿ一-龯]/.test(s);

/** contributes 以下の文字列を (パス, 値) で列挙する。 */
function strings(node: unknown, at: string[] = []): { path: string; value: string }[] {
    if (typeof node === 'string') return [{ path: at.join('.'), value: node }];
    if (Array.isArray(node)) return node.flatMap((v, i) => strings(v, [...at, String(i)]));
    if (node && typeof node === 'object') {
        return Object.entries(node).flatMap(([k, v]) => strings(v, [...at, k]));
    }
    return [];
}

describe('package.json の多言語化', () => {
    const pkg = readJson('package.json');
    const en = readJson('package.nls.json');
    const ja = readJson('package.nls.ja.json');
    const all = strings(pkg.contributes, ['contributes']);

    it('contributes に日本語をベタ書きしない（英語環境で日本語が出てしまう）', () => {
        const written = all.filter((s) => hasJapanese(s.value)).map((s) => `${s.path}: ${s.value}`);
        assert.deepStrictEqual(written, [], `日本語がベタ書きされている: ${written.join(' / ')}`);
    });

    it('使っている %key% はすべて英語・日本語の両方に訳がある', () => {
        const missing: string[] = [];
        for (const s of all) {
            const m = /^%(.+)%$/.exec(s.value);
            if (!m) continue;
            if (!(m[1] in en)) missing.push(`en: ${m[1]}`);
            if (!(m[1] in ja)) missing.push(`ja: ${m[1]}`);
        }
        assert.deepStrictEqual(missing, []);
    });

    it('英語の既定辞書に日本語が混ざっていない', () => {
        const wrong = Object.entries(en)
            .filter(([, v]) => typeof v === 'string' && hasJapanese(v))
            .map(([k]) => k);
        assert.deepStrictEqual(wrong, []);
    });

    it('日本語辞書と英語辞書のキーが揃っている', () => {
        assert.deepStrictEqual(Object.keys(en).sort(), Object.keys(ja).sort());
    });
});
