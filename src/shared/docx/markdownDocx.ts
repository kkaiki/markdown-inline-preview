/**
 * Markdown → Word（docx）の Document（VS Code API 非依存の純関数）。Word 書き出し（PRO+）で使う。
 *
 * marked（PDF 書き出しと同じ）の lexer でトークン列にし、`docx` ライブラリの文書に写す。
 * 画像の読み込みは `resolveImage` で注入する（fs に依存しない＝jsdom でテストできる）。
 * 設計: docs/private/specifications/pro-docx-export.md §2（対応する記法）
 */
import { marked, type Token, type Tokens } from 'marked';
import {
    AlignmentType,
    BorderStyle,
    Document,
    ExternalHyperlink,
    HeadingLevel,
    ImageRun,
    LevelFormat,
    Paragraph,
    ShadingType,
    Table,
    TableCell,
    TableRow,
    TextRun,
    WidthType,
    type IRunOptions,
    type ParagraphChild
} from 'docx';
import { imageInfo } from './imageInfo';
import { getStringWidth } from '../table/width';

export interface ResolvedImage {
    data: Uint8Array;
}
export interface MarkdownToDocxOptions {
    /** 相対パス・data URI を画像バイト列にする。解決できなければ undefined（代替テキストを出す） */
    resolveImage?: (src: string) => ResolvedImage | undefined;
    /** 東アジア文字のフォント（既定: Yu Gothic） */
    eastAsiaFont?: string;
    title?: string;
}

/* ---------- フォント・寸法 ---------- */
const MONO = { ascii: 'Consolas', hAnsi: 'Consolas', eastAsia: 'MS Gothic', cs: 'Consolas' };
/** A4 縦・左右 1 インチ余白の本文幅（twip） */
const CONTENT_WIDTH_TWIP = 11906 - 1440 * 2;
/** 画像の最大幅（px, 96dpi 換算で本文幅） */
const MAX_IMAGE_PX = Math.floor((CONTENT_WIDTH_TWIP / 1440) * 96);

/* ---------- インライン ---------- */
interface InlineStyle { bold?: boolean; italics?: boolean; strike?: boolean; code?: boolean }

function run(text: string, s: InlineStyle, extra: Partial<IRunOptions> = {}): TextRun {
    return new TextRun({
        text,
        bold: s.bold,
        italics: s.italics,
        strike: s.strike,
        ...(s.code ? { font: MONO, shading: { type: ShadingType.CLEAR, fill: 'EFF1F3', color: 'auto' } } : {}),
        ...extra
    });
}

function decode(s: string): string {
    return s
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}

function inlines(tokens: Token[] | undefined, s: InlineStyle, ctx: Ctx): ParagraphChild[] {
    const out: ParagraphChild[] = [];
    for (const t of tokens ?? []) {
        switch (t.type) {
            case 'text': {
                const tt = t as Tokens.Text;
                if (tt.tokens && tt.tokens.length) out.push(...inlines(tt.tokens, s, ctx));
                else out.push(run(decode(tt.text), s));
                break;
            }
            case 'escape': out.push(run(decode((t as Tokens.Escape).text), s)); break;
            case 'strong': out.push(...inlines((t as Tokens.Strong).tokens, { ...s, bold: true }, ctx)); break;
            case 'em': out.push(...inlines((t as Tokens.Em).tokens, { ...s, italics: true }, ctx)); break;
            case 'del': out.push(...inlines((t as Tokens.Del).tokens, { ...s, strike: true }, ctx)); break;
            case 'codespan': out.push(run(decode((t as Tokens.Codespan).text), { ...s, code: true })); break;
            case 'br': out.push(new TextRun({ break: 1 })); break;
            case 'link': {
                const l = t as Tokens.Link;
                const children = inlines(l.tokens, s, ctx);
                if (/^(https?:|mailto:)/i.test(l.href)) {
                    // 見た目は Hyperlink 文字スタイル（青・下線）に任せる
                    out.push(new ExternalHyperlink({
                        link: l.href,
                        children: inlinesAsHyperlink(l.tokens, s)
                    }));
                } else {
                    out.push(...children); // 相対リンク・#anchor は文字だけ残す
                }
                break;
            }
            case 'image': out.push(...imageRun(t as Tokens.Image, ctx)); break;
            case 'html': out.push(run((t as Tokens.HTML).text.replace(/<[^>]+>/g, ''), s)); break;
            case 'checkbox': break; // タスクの □ は list 側で付ける
            default: {
                const anyT = t as { text?: string };
                if (anyT.text) out.push(run(anyT.text, s));
            }
        }
    }
    return out;
}

function inlinesAsHyperlink(tokens: Token[] | undefined, s: InlineStyle): TextRun[] {
    const texts: TextRun[] = [];
    const walk = (ts: Token[] | undefined, st: InlineStyle) => {
        for (const t of ts ?? []) {
            const tt = t as Token & { tokens?: Token[]; text?: string };
            if (t.type === 'strong') walk(tt.tokens, { ...st, bold: true });
            else if (t.type === 'em') walk(tt.tokens, { ...st, italics: true });
            else if (tt.tokens?.length) walk(tt.tokens, st);
            else if (tt.text) texts.push(run(decode(tt.text), st, { style: 'Hyperlink' }));
        }
    };
    walk(tokens, s);
    return texts;
}

function imageRun(img: Tokens.Image, ctx: Ctx): ParagraphChild[] {
    const alt = img.text || img.href;
    const resolved = /^https?:/i.test(img.href) ? undefined : ctx.opts.resolveImage?.(img.href);
    const info = resolved ? imageInfo(resolved.data) : undefined;
    if (!resolved || !info) {
        ctx.warnings.push(`image not embedded: ${img.href}`);
        return [run(`[${alt}]`, { italics: true }, { color: '6A737D' })];
    }
    const scale = Math.min(1, MAX_IMAGE_PX / info.width);
    return [new ImageRun({
        type: info.type,
        data: resolved.data,
        transformation: { width: Math.round(info.width * scale), height: Math.round(info.height * scale) },
        altText: { name: alt, title: alt, description: alt }
    })];
}

/* ---------- ブロック ---------- */
interface Ctx { opts: MarkdownToDocxOptions; warnings: string[]; orderedInstance: number; orderedStarts: number[] }
type Block = Paragraph | Table;

const HEADINGS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3,
    HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6];

function blocks(tokens: Token[], ctx: Ctx, quoteDepth = 0): Block[] {
    const out: Block[] = [];
    const quote = quoteDepth > 0
        ? { indent: { left: 360 * quoteDepth }, border: { left: { style: BorderStyle.SINGLE, size: 18, color: 'D0D7DE', space: 8 } } }
        : {};
    for (const t of tokens) {
        switch (t.type) {
            case 'heading': {
                const h = t as Tokens.Heading;
                out.push(new Paragraph({ heading: HEADINGS[h.depth - 1], children: inlines(h.tokens, {}, ctx) }));
                break;
            }
            case 'paragraph': {
                const p = t as Tokens.Paragraph;
                out.push(new Paragraph({ children: inlines(p.tokens, quoteDepth ? { italics: false } : {}, ctx), ...quote }));
                break;
            }
            case 'code': {
                const c = t as Tokens.Code;
                const lines = c.text.split('\n');
                // 先頭の空白を保つ（docx は xml:space="preserve" を付ける）
                const children = lines.map((line, i) => new TextRun({ text: line, font: MONO, size: 18, break: i === 0 ? 0 : 1 }));
                out.push(new Paragraph({
                    children,
                    shading: { type: ShadingType.CLEAR, fill: 'F6F8FA', color: 'auto' },
                    border: {
                        top: { style: BorderStyle.SINGLE, size: 4, color: 'D0D7DE', space: 4 },
                        bottom: { style: BorderStyle.SINGLE, size: 4, color: 'D0D7DE', space: 4 },
                        left: { style: BorderStyle.SINGLE, size: 4, color: 'D0D7DE', space: 4 },
                        right: { style: BorderStyle.SINGLE, size: 4, color: 'D0D7DE', space: 4 }
                    },
                    spacing: { before: 120, after: 120, line: 260 }
                }));
                break;
            }
            case 'blockquote':
                out.push(...blocks((t as Tokens.Blockquote).tokens, ctx, quoteDepth + 1));
                break;
            case 'list':
                out.push(...list(t as Tokens.List, ctx, 0));
                break;
            case 'table':
                out.push(table(t as Tokens.Table, ctx));
                out.push(new Paragraph({ children: [] })); // 表の直後に段落が無いと Word で表同士がくっつく
                break;
            case 'hr':
                out.push(new Paragraph({ children: [], border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'D0D7DE', space: 1 } } }));
                break;
            case 'html':
                out.push(new Paragraph({ children: [run((t as Tokens.HTML).text.replace(/<[^>]+>/g, '').trim(), {})] }));
                break;
            case 'space':
                break;
            case 'text': // リスト内のタイト段落など
                out.push(new Paragraph({ children: inlines((t as Tokens.Text).tokens ?? [t], {}, ctx), ...quote }));
                break;
            default:
                ctx.warnings.push(`unsupported block: ${t.type}`);
        }
    }
    return out;
}

function list(l: Tokens.List, ctx: Ctx, level: number): Block[] {
    const out: Block[] = [];
    const instance = l.ordered ? ++ctx.orderedInstance : 0;
    if (l.ordered) ctx.orderedStarts[instance] = typeof l.start === 'number' ? l.start : 1;
    for (const item of l.items) {
        let first = true;
        for (const child of item.tokens) {
            if (child.type === 'list') {
                out.push(...list(child as Tokens.List, ctx, level + 1));
                continue;
            }
            if (child.type === 'space' || child.type === 'checkbox') continue;
            const inner = (child as Tokens.Text).tokens ?? [child];
            const kids = inlines(child.type === 'paragraph' || child.type === 'text' ? inner : [child], {}, ctx);
            if (first && item.task) {
                kids.unshift(new TextRun({ text: item.checked ? '☑ ' : '☐ ', font: { ascii: 'Segoe UI Symbol', hAnsi: 'Segoe UI Symbol', eastAsia: 'MS Gothic' } }));
            }
            if (first) {
                if (item.task) {
                    // タスクは箇条書きの黒丸を付けず、□ を行頭記号にする
                    out.push(new Paragraph({ children: kids, indent: { left: 360 * (level + 1), hanging: 280 } }));
                } else if (l.ordered) {
                    out.push(new Paragraph({ children: kids, numbering: { reference: `md-ordered-${instance}`, level } }));
                } else {
                    out.push(new Paragraph({ children: kids, numbering: { reference: 'md-bullet', level } }));
                }
            } else {
                // 同じ項目の 2 段落目以降は記号なしで字下げだけ
                out.push(new Paragraph({ children: kids, indent: { left: 360 * (level + 1) } }));
            }
            first = false;
        }
    }
    return out;
}

function table(tb: Tokens.Table, ctx: Ctx): Table {
    const cols = tb.header.length;
    const widths = tb.header.map((h, i) =>
        Math.max(4, getStringWidth(h.text), ...tb.rows.map((r) => getStringWidth(r[i]?.text ?? '')))
    );
    const total = widths.reduce((a, b) => a + b, 0);
    const columnWidths = widths.map((w) => Math.floor((CONTENT_WIDTH_TWIP * w) / total));
    const align = (a: string | null) =>
        a === 'center' ? AlignmentType.CENTER : a === 'right' ? AlignmentType.RIGHT : AlignmentType.LEFT;
    const border = { style: BorderStyle.SINGLE, size: 4, color: 'D0D7DE' };
    const borders = { top: border, bottom: border, left: border, right: border };
    const cell = (c: Tokens.TableCell, i: number, header: boolean) =>
        new TableCell({
            borders,
            width: { size: columnWidths[i], type: WidthType.DXA },
            shading: header ? { type: ShadingType.CLEAR, fill: 'F6F8FA', color: 'auto' } : undefined,
            margins: { top: 60, bottom: 60, left: 100, right: 100 },
            children: [new Paragraph({
                alignment: align(tb.align[i]),
                children: inlines(c.tokens, header ? { bold: true } : {}, ctx)
            })]
        });
    return new Table({
        width: { size: CONTENT_WIDTH_TWIP, type: WidthType.DXA },
        columnWidths,
        rows: [
            new TableRow({ tableHeader: true, children: tb.header.map((c, i) => cell(c, i, true)) }),
            ...tb.rows.map((r) => new TableRow({ children: Array.from({ length: cols }, (_, i) => cell(r[i] ?? { text: '', tokens: [], header: false, align: null }, i, false)) }))
        ]
    });
}

/* ---------- 文書 ---------- */
function levels(ordered: boolean, start = 1) {
    const bullets = ['•', '◦', '▪'];
    const fmts = [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN];
    return Array.from({ length: 9 }, (_, level) => ({
        level,
        format: ordered ? fmts[level % 3] : LevelFormat.BULLET,
        text: ordered ? `%${level + 1}.` : bullets[level % 3],
        alignment: AlignmentType.LEFT,
        ...(ordered && level === 0 ? { start } : {}),
        style: { paragraph: { indent: { left: 360 * (level + 1), hanging: 280 } } }
    }));
}

export function markdownToDocx(markdown: string, opts: MarkdownToDocxOptions = {}): { doc: Document; warnings: string[] } {
    const ctx: Ctx = { opts, warnings: [], orderedInstance: 0, orderedStarts: [] };
    const tokens = marked.lexer(markdown, { gfm: true });
    const children = blocks(tokens, ctx);
    const eastAsia = opts.eastAsiaFont ?? 'Yu Gothic';
    const bodyFont = { ascii: 'Calibri', hAnsi: 'Calibri', eastAsia, cs: 'Calibri' };
    const heading = (size: number) => ({
        run: { size, bold: true, color: '1F2328', font: bodyFont },
        paragraph: { spacing: { before: 240, after: 120 }, keepNext: true }
    });
    const doc = new Document({
        title: opts.title,
        creator: 'Markdown Inline Preview',
        styles: {
            default: {
                document: {
                    run: { font: bodyFont, size: 21, language: { value: 'en-US', eastAsia: 'ja-JP' } },
                    paragraph: { spacing: { after: 120, line: 300 } }
                },
                heading1: heading(36), heading2: heading(30), heading3: heading(26),
                heading4: heading(23), heading5: heading(21), heading6: heading(21),
                hyperlink: { run: { color: '0969DA', underline: {} } }
            }
        },
        numbering: {
            config: [
                { reference: 'md-bullet', levels: levels(false) },
                // 番号付きリストは 1 つごとに別の abstractNum にする。同じ abstractNum の
                // instance 違い（startOverride）は Word 以外（Pages・Quick Look・pandoc）で番号が続いてしまう
                ...Array.from({ length: ctx.orderedInstance }, (_, i) => ({ reference: `md-ordered-${i + 1}`, levels: levels(true, ctx.orderedStarts[i + 1]) }))
            ]
        },
        sections: [{
            properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
            children
        }]
    });
    return { doc, warnings: ctx.warnings };
}
