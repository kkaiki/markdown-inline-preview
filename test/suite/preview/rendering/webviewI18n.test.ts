/**
 * WebView i18n（src/preview/webview/i18n.ts）のユニットテスト。
 * 純粋ロジック（言語判定・辞書ルックアップ・フォールバック）を検証する。
 */
import * as assert from 'assert';
import { setLanguage, t } from '../../../../src/preview/webview/i18n';
import { SLASH_MENU_ITEMS } from '../../../../src/shared/slash/slashMenuItems';

describe('webview i18n: t / setLanguage', () => {
    afterEach(() => setLanguage('en')); // 既定（英語）に戻す

    it('既定（英語）はソース文字列をそのまま返す', () => {
        setLanguage('en');
        assert.strictEqual(t('Heading 1'), 'Heading 1');
        assert.strictEqual(t('Find'), 'Find');
    });

    it('日本語（ja）は辞書の訳を返す', () => {
        setLanguage('ja');
        assert.strictEqual(t('Heading 1'), '見出し 1');
        assert.strictEqual(t('Find'), '検索');
        assert.strictEqual(t('Delete table'), '表を削除');
    });

    it('ja-JP など地域コードも前方一致で日本語扱い', () => {
        setLanguage('ja-JP');
        assert.strictEqual(t('Checkbox'), 'チェックボックス');
    });

    it('大文字小文字を問わず ja を判定する', () => {
        setLanguage('JA');
        assert.strictEqual(t('Bullet list'), '箇条書き');
    });

    it('辞書に無いキーはソース（英語）にフォールバック', () => {
        setLanguage('ja');
        assert.strictEqual(t('No such key here'), 'No such key here');
    });

    it('日本語以外の言語はソース（英語）を返す', () => {
        setLanguage('fr');
        assert.strictEqual(t('Heading 1'), 'Heading 1');
    });

    it('undefined / 空文字は英語扱い', () => {
        setLanguage(undefined);
        assert.strictEqual(t('Find'), 'Find');
        setLanguage('');
        assert.strictEqual(t('Find'), 'Find');
    });

    it('全スラッシュメニュー項目の detail に日本語訳がある（英語のまま漏れない）', () => {
        setLanguage('ja');
        for (const item of SLASH_MENU_ITEMS) {
            assert.notStrictEqual(
                t(item.detail),
                item.detail,
                `slash "${item.id}" の detail "${item.detail}" に日本語訳が無い`
            );
        }
    });
});
