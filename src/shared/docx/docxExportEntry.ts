/**
 * Word 書き出し（PRO+）の別バンドル `out/docxExport.js` の入口（VS Code 非依存）。
 * front-matter を除いて docx に変換し、zip のバイト列を返す。title は front-matter の `title:` を優先する。
 * 拡張本体からは書き出し時にだけ require する（`docx` を起動時に読まないため）。
 */
import { Packer } from 'docx';
import { markdownToDocx, type MarkdownToDocxOptions } from './markdownDocx';
import { parseFrontmatterEntries, splitFrontmatter } from '../markdown/frontmatter';

export async function exportDocx(
    markdown: string,
    opts: MarkdownToDocxOptions
): Promise<{ data: Uint8Array; warnings: string[] }> {
    const { frontmatter, body } = splitFrontmatter(markdown);
    const rawTitle = frontmatter
        ? parseFrontmatterEntries(frontmatter).find((e) => e.key === 'title')?.value.replace(/^["']|["']$/g, '')
        : undefined;
    // 空の title: は無いものとして、ファイル名（opts.title）を使う
    const title = rawTitle && rawTitle.trim() !== '' ? rawTitle : opts.title;
    const { doc, warnings } = markdownToDocx(body, { ...opts, title });
    const data = await Packer.toBuffer(doc);
    return { data: new Uint8Array(data), warnings };
}
