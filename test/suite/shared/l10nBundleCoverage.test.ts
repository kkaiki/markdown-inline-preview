/**
 * ホスト側の `vscode.l10n.t('English …')` の英語の文字列すべてに、日本語の訳（`l10n/bundle.l10n.ja.json`）がある。
 *
 * 訳が無いと、日本語の VS Code でも英語のまま出る。購入案内のダイアログのように、利用者が必ず目にして
 * お金に関わる文面は特に、英語と日本語で内容が食い違わないようにしたい（2026-10-05 に「返金なし」を足したとき追加）。
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

const repoRoot = (() => {
    let dir = __dirname;
    while (!fs.existsSync(path.join(dir, 'package.json'))) dir = path.dirname(dir);
    return dir;
})();

const bundle = JSON.parse(fs.readFileSync(path.join(repoRoot, 'l10n/bundle.l10n.ja.json'), 'utf8')) as Record<string, string>;

function tsFiles(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) return tsFiles(full);
        return e.name.endsWith('.ts') ? [full] : [];
    });
}

/** `vscode.l10n.t(` の最初の引数が文字列リテラル（改行をまたいでもよい）のもの。 */
function l10nSources(file: string): string[] {
    const text = fs.readFileSync(file, 'utf8');
    const found: string[] = [];
    const re = /l10n\.t\(\s*(['"])((?:(?!\1)[^\\]|\\.)*)\1/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) found.push(m[2].replace(/\\'/g, "'").replace(/\\"/g, '"'));
    return found;
}

describe('ホスト側の UI 文字列の日本語訳（l10n/bundle.l10n.ja.json）', () => {
    it('購入案内（proGate）の文字列には、すべて日本語の訳がある', () => {
        const sources = l10nSources(path.join(repoRoot, 'src/license/proGate.ts'));
        assert.ok(sources.length >= 3, `文字列が見つからない: ${sources.length}`);
        const missing = sources.filter((s) => !(s in bundle));
        assert.deepStrictEqual(missing, []);
    });

    it('購入案内は「返金なし」を英語・日本語の両方で伝える', () => {
        const [detail] = l10nSources(path.join(repoRoot, 'src/license/proGate.ts')).filter((s) => s.startsWith('PRO+ is a one-time purchase'));
        assert.ok(detail, '購入案内の詳細文が見つからない');
        assert.match(detail, /not refundable/i);
        assert.match(bundle[detail] ?? '', /返金/);
    });
});
