/**
 * ソースコードに日本語の UI 文字列をベタ書きしていないこと。
 *
 * ユーザー指示（2026-09-12）:「基本的には英語にしつつ、日本語の時は日本語に対応する」。
 * そのためには**ソース文字列は英語**で書き、訳は辞書に持つ必要がある:
 *   - ホスト側: `vscode.l10n.t('English')` ＋ `l10n/bundle.l10n.ja.json`
 *   - webview 側: `t('English')` ＋ `src/live/shared/webviewStrings.ts`
 *   - package.json: `%key%` ＋ `package.nls[.ja].json`
 *
 * ベタ書きすると英語環境でも日本語が出るので、ここで機械的に止める。
 * （コメントの日本語は対象外。この方針自体はドキュメントもコメントも日本語のまま。）
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

const repoRoot = (() => {
    let dir = __dirname;
    while (!fs.existsSync(path.join(dir, 'package.json'))) dir = path.dirname(dir);
    return dir;
})();

/** 辞書そのものは日本語を持っていてよい。 */
const ALLOWED = ['src/live/shared/webviewStrings.ts'];

function tsFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...tsFiles(full));
        else if (entry.name.endsWith('.ts')) out.push(full);
    }
    return out;
}

/** コメントを除いた行に出てくる日本語の文字列リテラル。 */
function japaneseLiterals(source: string): string[] {
    const found: string[] = [];
    let inBlock = false;
    source.split('\n').forEach((line) => {
        const trimmed = line.trim();
        if (inBlock) {
            if (trimmed.includes('*/')) inBlock = false;
            return;
        }
        if (trimmed.startsWith('/*')) {
            if (!trimmed.includes('*/')) inBlock = true;
            return;
        }
        if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;
        const code = line.replace(/\/\/.*$/, '');
        for (const m of code.matchAll(/'([^']*)'|"([^"]*)"|`([^`]*)`/g)) {
            const value = m[1] ?? m[2] ?? m[3] ?? '';
            if (/[぀-ヿ一-龯]/.test(value)) found.push(value);
        }
    });
    return found;
}

describe('ソースの UI 文字列は英語（i18n）', () => {
    it('src 配下に日本語の文字列リテラルを書かない（辞書を除く）', () => {
        const offenders: string[] = [];
        for (const file of tsFiles(path.join(repoRoot, 'src'))) {
            const rel = path.relative(repoRoot, file);
            if (ALLOWED.includes(rel)) continue;
            for (const value of japaneseLiterals(fs.readFileSync(file, 'utf8'))) {
                offenders.push(`${rel}: ${value.slice(0, 40)}`);
            }
        }
        assert.deepStrictEqual(offenders, [], `日本語がベタ書きされている: ${offenders.join(' / ')}`);
    });

    it('ホスト側の vscode.l10n.t の文字列には、すべて日本語訳がある（訳し忘れ防止）', () => {
        const bundle = JSON.parse(
            fs.readFileSync(path.join(repoRoot, 'l10n/bundle.l10n.ja.json'), 'utf8')
        ) as Record<string, string>;
        // 'a' + 'b' の連結もひとつのキーとして読む
        const literal = String.raw`'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"`;
        const call = new RegExp(String.raw`l10n\.t\(\s*((?:${literal})(?:\s*\+\s*(?:${literal}))*)`, 'g');
        const unquote = (piece: string): string =>
            piece.slice(1, -1).replace(/\\(.)/g, (_, c: string) => (c === 'n' ? '\n' : c));

        const missing: string[] = [];
        for (const file of tsFiles(path.join(repoRoot, 'src'))) {
            const source = fs.readFileSync(file, 'utf8');
            for (const m of source.matchAll(call)) {
                const key = (m[1].match(new RegExp(literal, 'g')) ?? []).map(unquote).join('');
                if (!(key in bundle)) missing.push(`${path.relative(repoRoot, file)}: ${key}`);
            }
        }
        assert.deepStrictEqual(missing, [], `日本語訳が無い: \n${missing.join('\n')}`);
    });

    it('日本語の訳（l10n バンドル）のキーは英語である', () => {
        const bundle = JSON.parse(
            fs.readFileSync(path.join(repoRoot, 'l10n/bundle.l10n.ja.json'), 'utf8')
        ) as Record<string, string>;
        const wrong = Object.keys(bundle).filter((k) => /[぀-ヿ一-龯]/.test(k));
        assert.deepStrictEqual(wrong, []);
    });
});
