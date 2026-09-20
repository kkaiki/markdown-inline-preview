/**
 * webview（Live モード）の UI 文字列の言語切り替え。
 *
 * ユーザー指示（2026-09-12）:「エディタの設定に従い、基本的には英語にしつつ、
 * 日本語の時は日本語に対応するようにしてほしい」。
 *
 * ソース文字列は**英語**（ホスト側の `vscode.l10n.t` と同じ方式）。日本語は辞書で上書きする。
 * 「訳し忘れ」を防ぐため、実際のソースコードに出てくる `t('…')` のキーが
 * すべて日本語辞書にあることもここで検査する。
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { createTranslator, isJapaneseLocale, JA_STRINGS } from '../../../../src/live/shared/webviewStrings';

describe('Live モード: webview の文字列（i18n）', () => {
    it('既定（ロケール未指定）は英語のまま', () => {
        const t = createTranslator(undefined);
        assert.strictEqual(t('Bold'), 'Bold');
    });

    it('英語ロケールでは英語のまま', () => {
        assert.strictEqual(createTranslator('en')('Heading 1'), 'Heading 1');
        assert.strictEqual(createTranslator('en-US')('Heading 1'), 'Heading 1');
    });

    it('日本語ロケールでは日本語になる', () => {
        assert.strictEqual(createTranslator('ja')('Heading 1'), '見出し 1');
        assert.strictEqual(createTranslator('ja-JP')('Bold'), '太字');
    });

    it('ロケール判定は大文字小文字・地域コードを無視する', () => {
        assert.strictEqual(isJapaneseLocale('JA'), true);
        assert.strictEqual(isJapaneseLocale('ja-jp'), true);
        assert.strictEqual(isJapaneseLocale('en'), false);
        assert.strictEqual(isJapaneseLocale(undefined), false);
    });

    it('辞書に無いキーは英語（ソース文字列）のまま返す', () => {
        assert.strictEqual(createTranslator('ja')('Not translated yet'), 'Not translated yet');
    });

    it('webview のソースに出てくる t(…) のキーはすべて日本語訳がある', () => {
        // out-test/ から実行されるので、リポジトリのルートを遡って探す
        const repoRoot = (() => {
            let dir = __dirname;
            while (!fs.existsSync(path.join(dir, 'package.json'))) dir = path.dirname(dir);
            return dir;
        })();
        const roots = ['src/live/webview', 'src/live/shared', 'src/shared/slash'];
        const files: string[] = [];
        for (const root of roots) {
            const dir = path.join(repoRoot, root);
            for (const name of fs.readdirSync(dir)) {
                // 辞書そのもの（説明コメントに t('…') と書いてある）は除く
                if (name.endsWith('.ts') && name !== 'webviewStrings.ts') files.push(path.join(dir, name));
            }
        }

        const missing: string[] = [];
        for (const file of files) {
            const text = fs.readFileSync(file, 'utf8');
            for (const m of text.matchAll(/\bt\('((?:[^'\\]|\\.)+)'\)/g)) {
                const key = m[1].replace(/\\'/g, "'");
                if (!(key in JA_STRINGS)) missing.push(`${path.basename(file)}: ${key}`);
            }
        }
        assert.deepStrictEqual(missing, [], `日本語訳が無い文字列: ${missing.join(' / ')}`);
    });

    it('日本語辞書に英語ソースと同じだけの見出し・表メニューが揃っている', () => {
        for (const key of [
            'Heading 1',
            'Checkbox',
            'Bulleted list',
            'Numbered list',
            'Quote',
            'Toggle list',
            'Bold',
            'Italic',
            'Underline',
            'Strikethrough',
            'Inline code',
            'Link',
            'Export to PDF (free)',
            'Open in Raw mode',
            'Zoom out',
            'Zoom in',
            'Reset zoom to 100%',
            'Select row',
            'Select column',
            'Insert row above',
            'Insert row below',
            'Insert column left',
            'Insert column right',
            'Delete row',
            'Delete column',
            'Delete table',
            'Resize column',
            'Added line',
            'Modified line',
            'Previous line deleted'
        ]) {
            assert.ok(key in JA_STRINGS, `日本語訳が無い: ${key}`);
        }
    });
});
