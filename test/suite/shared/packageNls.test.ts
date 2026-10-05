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

    it('コマンド名（title / shortTitle）はすべて %key% で、日本語の VS Code では日本語で出る', () => {
        // ユーザー要望 2026-09-29（C）: 以前は Live / Raw 切り替えの 2 つ以外が英語のベタ書きで、
        // 日本語の VS Code でも右クリックやコマンドパレットに「Export to PDF」のように英語で出ていた
        const commands = ((pkg.contributes as { commands: Record<string, string>[] }).commands);
        const literal = commands.flatMap((c) =>
            (['title', 'shortTitle'] as const)
                .filter((k) => typeof c[k] === 'string' && !/^%.+%$/.test(c[k]))
                .map((k) => `${c.command}.${k}: ${c[k]}`)
        );
        assert.deepStrictEqual(literal, []);
    });

    it('日本語のコマンド名は英語と別の文字列になっている（訳し忘れて英語をそのまま入れていない）', () => {
        const commands = ((pkg.contributes as { commands: Record<string, string>[] }).commands);
        const same = commands
            .map((c) => /^%(.+)%$/.exec(c.title ?? '')?.[1])
            .filter((k): k is string => k !== undefined && en[k] === ja[k])
            // ブランド名・記号だけの名前は訳さない
            .filter((k) => !/^(Raw|Live|PRO\+.*)$/.test(en[k] as string));
        assert.deepStrictEqual(same, []);
    });

    it('ウォークスルー等の説明文に書いたコマンドリンク（command:…）は、実在するコマンドを指す', () => {
        const declared = new Set(((pkg.contributes as { commands: { command: string }[] }).commands).map((c) => c.command));
        const broken: string[] = [];
        for (const dict of [en, ja]) {
            for (const [key, value] of Object.entries(dict)) {
                for (const m of (typeof value === 'string' ? value : '').matchAll(/command:([\w.]+)/g)) {
                    if (!declared.has(m[1])) broken.push(`${key}: ${m[1]}`);
                }
            }
        }
        assert.deepStrictEqual(broken, []);
    });

    it('ウォークスルーの説明ファイル（media/walkthrough/*.md）は英語で、削除した Preview モードに触れない', () => {
        // 説明ファイルは言語で切り替えられないので、既定（英語）で書く。以前は日本語だけで、
        // 英語の VS Code でも日本語が出ていた。内容も Preview 時代のままだった（2026-09-29）
        const dir = path.join(repoRoot, 'media', 'walkthrough');
        const wrong = fs.readdirSync(dir).filter((f) => f.endsWith('.md')).flatMap((f) => {
            const text = fs.readFileSync(path.join(dir, f), 'utf8');
            return [
                ...(hasJapanese(text) ? [`${f}: 日本語`] : []),
                ...(/\bPreview\b/.test(text.replace(/Markdown Inline Preview/g, '')) ? [`${f}: Preview`] : [])
            ];
        });
        assert.deepStrictEqual(wrong, []);
    });

    it('右クリックなどのメニューに出るコマンドは、見出しが「Markdown Inline Preview: 」で始まる（ほかの拡張の項目と見分けられる）', () => {
        // ユーザー要望 2026-10-01:「Open in Live mode ではなく、Markdown Inline Preview: Open Live mode となるようにして欲しい」
        // メニューは category を表示しないので、見出し自体に拡張名を入れる。category を残すとコマンドパレットで
        // 「Markdown Inline Preview: Markdown Inline Preview: …」と二重になるので外す。
        const contributes = pkg.contributes as {
            commands: Record<string, string>[];
            menus: Record<string, { command: string }[]>;
        };
        const inMenus = new Set(Object.entries(contributes.menus)
            .filter(([where]) => !['commandPalette', 'editor/title'].includes(where))
            .flatMap(([, items]) => items.map((m) => m.command)));
        const wrong: string[] = [];
        for (const c of contributes.commands.filter((x) => inMenus.has(x.command))) {
            const key = /^%(.+)%$/.exec(c.title ?? '')?.[1] ?? '';
            for (const [lang, dict] of [['en', en], ['ja', ja]] as const) {
                const title = dict[key];
                if (typeof title !== 'string' || !title.startsWith('Markdown Inline Preview: ')) wrong.push(`${c.command} ${lang}: ${JSON.stringify(title)}`);
            }
            if (c.category) wrong.push(`${c.command}: category が残っている`);
        }
        assert.deepStrictEqual(wrong, []);
    });

    it('エディタ右上のボタン（editor/title）には、拡張名の付かない短い見出し（shortTitle）を出す', () => {
        // 右上のボタンは shortTitle を表示する（VS Code の editor title は renderShortTitle）。長い見出しでボタンを広げない
        const contributes = pkg.contributes as {
            commands: Record<string, string>[];
            menus: Record<string, { command: string }[]>;
        };
        const titleBar = new Set((contributes.menus['editor/title'] ?? []).map((m) => m.command));
        const wrong: string[] = [];
        for (const c of contributes.commands.filter((x) => titleBar.has(x.command))) {
            const label = /^%(.+)%$/.exec(c.shortTitle ?? c.title ?? '')?.[1] ?? '';
            for (const dict of [en, ja]) {
                const text = dict[label];
                if (typeof text !== 'string' || text.startsWith('Markdown Inline Preview')) wrong.push(`${c.command}: ${JSON.stringify(text)}`);
            }
        }
        assert.deepStrictEqual(wrong, []);
    });

    it('日本語辞書と英語辞書のキーが揃っている', () => {
        assert.deepStrictEqual(Object.keys(en).sort(), Object.keys(ja).sort());
    });
});

describe('設定 markdownInline.indentation（リストのインデント幅）の宣言', () => {
    const pkg = readJson('package.json') as { contributes: { configuration: { properties: Record<string, { type?: string; default?: unknown; enum?: string[]; description?: string }> } } };
    const prop = pkg.contributes.configuration.properties['markdownInline.indentation'];
    const en = readJson('package.nls.json');
    const ja = readJson('package.nls.ja.json');

    it('default / editor の 2 択で、既定は default（今までの見た目を変えない）', () => {
        assert.ok(prop, 'markdownInline.indentation が宣言されていない');
        assert.deepStrictEqual(prop.enum, ['default', 'editor']);
        assert.strictEqual(prop.default, 'default');
    });

    it('説明は %key% で、英語・日本語の両方がある', () => {
        const m = /^%(.+)%$/.exec(prop?.description ?? '');
        assert.ok(m, `説明が %key% でない: ${prop?.description}`);
        assert.ok(typeof en[m[1]] === 'string' && (en[m[1]] as string).length > 0, '英語の説明が無い');
        assert.ok(typeof ja[m[1]] === 'string' && hasJapanese(ja[m[1]] as string), '日本語の説明が無い');
    });
});

describe('設定 markdownInline.live.codeBlockLineNumbers（コードブロックの行番号）の宣言', () => {
    const pkg = readJson('package.json') as { contributes: { configuration: { properties: Record<string, { type?: string; default?: unknown; description?: string }> } } };
    const prop = pkg.contributes.configuration.properties['markdownInline.live.codeBlockLineNumbers'];
    const en = readJson('package.nls.json');
    const ja = readJson('package.nls.ja.json');

    it('真偽値で、既定は false（今までの見た目を変えない）', () => {
        assert.ok(prop, 'markdownInline.live.codeBlockLineNumbers が宣言されていない');
        assert.strictEqual(prop.type, 'boolean');
        assert.strictEqual(prop.default, false);
    });

    it('説明は %key% で、英語・日本語の両方がある', () => {
        const m = /^%(.+)%$/.exec(prop?.description ?? '');
        assert.ok(m, `説明が %key% でない: ${prop?.description}`);
        assert.ok(typeof en[m[1]] === 'string' && (en[m[1]] as string).length > 0, '英語の説明が無い');
        assert.ok(typeof ja[m[1]] === 'string' && hasJapanese(ja[m[1]] as string), '日本語の説明が無い');
    });
});
