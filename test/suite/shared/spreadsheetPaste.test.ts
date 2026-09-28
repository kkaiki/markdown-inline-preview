/**
 * Excel・Google スプレッドシート・Numbers からコピーした範囲を、貼り付け時に Markdown の表へ変える
 * 純関数（`src/shared/table/spreadsheetPaste.ts`）を固定する。
 *
 * ユーザー要望（2026-09-28）:「Excel・スプレッドシートから表を貼り付け」を無料の既定機能にする。
 * スプレッドシートはクリップボードにタブ区切り（text/plain）と HTML の表（text/html）を両方入れる。
 * VS Code 等からコピーしたコードもタブを含むので、誤変換しない条件をここで全部固定する。
 */
import * as assert from 'assert';
import {
    spreadsheetToMarkdownTable,
    surroundTableForInsertion
} from '../../../src/shared/table/spreadsheetPaste';

const HTML_TABLE = '<html><body><table><tr><td>x</td></tr></table></body></html>';

describe('スプレッドシートの範囲を Markdown の表にする', () => {
    it('Excel からコピーした範囲（タブ区切り + HTML の表）を、1 行目を見出しにした表にする', () => {
        assert.strictEqual(
            spreadsheetToMarkdownTable('氏名\t年齢\r\n田中\t30\r\n', HTML_TABLE),
            ['| 氏名 | 年齢 |', '| ---- | ---- |', '| 田中 | 30   |'].join('\n')
        );
    });

    it('全角文字の幅を 2 として列をそろえる', () => {
        assert.strictEqual(
            spreadsheetToMarkdownTable('name\t部署\nAlice\t営業部\n', HTML_TABLE),
            ['| name  | 部署   |', '| ----- | ------ |', '| Alice | 営業部 |'].join('\n')
        );
    });

    it('セル内の改行（Excel が "" で囲む）は <br> にする', () => {
        const table = spreadsheetToMarkdownTable('a\tb\r\n"1行目\n2行目"\tx\r\n', HTML_TABLE);
        assert.ok(table?.includes('| 1行目<br>2行目 | x'), table ?? 'null');
    });

    it('"" でエスケープされた引用符を元に戻す', () => {
        const table = spreadsheetToMarkdownTable('a\tb\r\n"say ""hi"""\tx\r\n', HTML_TABLE);
        assert.ok(table?.includes('| say "hi" | x'), table ?? 'null');
    });

    it('セル内の | はエスケープする（列が増えないように）', () => {
        const table = spreadsheetToMarkdownTable('a\tb\na|b\tc\n', HTML_TABLE);
        assert.ok(table?.includes('| a\\|b | c'), table ?? 'null');
    });

    it('空のセルは空のまま列を保つ', () => {
        assert.strictEqual(
            spreadsheetToMarkdownTable('a\tb\tc\n1\t\t3\n', HTML_TABLE),
            ['| a   | b   | c   |', '| --- | --- | --- |', '| 1   |     | 3   |'].join('\n')
        );
    });

    it('1 行だけの範囲も、見出しだけの表にする（HTML の表があるとき）', () => {
        assert.strictEqual(
            spreadsheetToMarkdownTable('a\tb\n', HTML_TABLE),
            ['| a   | b   |', '| --- | --- |'].join('\n')
        );
    });

    it('VS Code 等からコピーしたコード（HTML はあるが表ではない）は変換しない', () => {
        assert.strictEqual(
            spreadsheetToMarkdownTable('int\tx;\nint\ty;\n', '<div style="color: #333"><span>int</span></div>'),
            null
        );
    });

    it('HTML が無いときは、2 行以上・2 列以上で列数がそろったタブ区切りだけ変換する', () => {
        assert.ok(spreadsheetToMarkdownTable('a\tb\nc\td\n', undefined));
        assert.ok(spreadsheetToMarkdownTable('a\tb\nc\td\n', ''));
        assert.strictEqual(spreadsheetToMarkdownTable('a\tb\n', undefined), null);
        assert.strictEqual(spreadsheetToMarkdownTable('a\tb\nc\td\te\n', undefined), null);
    });

    it('行頭のタブ（インデント）で 1 列目が全部空なら、コードとみなして変換しない', () => {
        assert.strictEqual(spreadsheetToMarkdownTable('\tfoo\n\tbar\n', undefined), null);
    });

    it('タブを含まない文字列は変換しない', () => {
        assert.strictEqual(spreadsheetToMarkdownTable('a\nb\n', HTML_TABLE), null);
        assert.strictEqual(spreadsheetToMarkdownTable('', HTML_TABLE), null);
    });
});

describe('貼り付け位置に合わせて表の前後に改行を足す', () => {
    const TABLE = '| a | b |\n| - | - |';

    it('空行の中（前後も空行）なら、表だけを入れる', () => {
        assert.strictEqual(
            surroundTableForInsertion(TABLE, { before: '', after: '', prevLine: '', nextLine: '' }),
            TABLE
        );
    });

    it('行の途中なら、前後に空行を作って表を独立させる', () => {
        assert.strictEqual(
            surroundTableForInsertion(TABLE, { before: 'abc', after: 'def', prevLine: '', nextLine: '' }),
            `\n\n${TABLE}\n\n`
        );
    });

    it('段落の直後の行なら、前に空行を足す（段落の続きと読まれないように）', () => {
        assert.strictEqual(
            surroundTableForInsertion(TABLE, { before: '', after: '', prevLine: '段落', nextLine: '' }),
            `\n${TABLE}`
        );
    });

    it('次の行に文字があるなら、後ろに空行を足す（表の行として吸い込まれないように）', () => {
        assert.strictEqual(
            surroundTableForInsertion(TABLE, { before: '', after: '', prevLine: '', nextLine: '段落' }),
            `${TABLE}\n`
        );
    });
});
