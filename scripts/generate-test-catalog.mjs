#!/usr/bin/env node
/**
 * テストカタログ生成スクリプト。
 *
 * 全テストファイル（test/suite, test/browser, test/extension。いずれも
 * レイヤー配下に cursor-focus / shortcuts / lists-tables 等の症状カテゴリで分類されている。
 * 詳細は docs/testing/test-directory-design.md）から describe/suite/it/test の
 * タイトルとファイル冒頭のドキュメントコメントを抽出し、
 * docs/testing/preview-test-catalog.md に「ユースケース一覧」として書き出す。
 *
 * テストのタイトル＝「この操作をしたらこう動く」という仕様文になっているため、
 * このカタログがそのまま実利用ユースケースの一覧になる。
 *
 * 実行: npm run docs:test-catalog
 * （テストを追加・改名したら必ず再実行してコミットに含めること）
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs', 'testing', 'preview-test-catalog.md');

/** カタログのセクション定義（表示順）。 */
const SECTIONS = [
    {
        title: '実 VS Code 拡張ホスト（`@vscode/test-electron`）',
        run: 'npx tsc -p tsconfig.test.json && node ./out-test/test/runTest.js',
        note: '実際の VS Code を **1 回だけ起動し、その同じインスタンス内で** raw/live 両方・全カテゴリのテストを連続実行する。コマンド・タブ・フォーカス・設定連携を検証する、最も実践に近い層。`raw/`＝Raw、`live/`＝Live、それぞれ配下を `lists-tables`/`navigation`/`tabs-editors` 等の症状カテゴリで分類。`MOCHA_GREP` で絞り込み可。',
        files: () => listTests(path.join(ROOT, 'test', 'extension'))
    },
    {
        title: '実 Chromium ブラウザ（Playwright + 実 webview バンドル）— すべて Live',
        run: 'npm run test:browser',
        note: '実レイアウト・実キー入力・実キャレット座標で Live（CodeMirror 6）を検証する。UI バグの最終判定。配下は `focus-expand`/`editing-core`/`ime` 等の症状カテゴリで分類。',
        files: () => listTests(path.join(ROOT, 'test', 'browser'))
    },
    {
        title: 'ユニット・純関数（jsdom）— live/ raw/ shared/ に分類',
        run: 'npm run test:unit',
        note: 'ロジック単体の高速テスト。`live/`＝Live 側、`raw/`＝Raw 側（各々さらに症状カテゴリで分類）、`shared/`＝両モード共通のロジック（カテゴリ分割せず均質に管理）。',
        files: () => listTests(path.join(ROOT, 'test', 'suite'))
    }
];

/** ディレクトリ配下の *.test.ts を再帰的に列挙する（サブディレクトリ→ファイル名順）。 */
function listTests(dir) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...listTests(full));
        else if (entry.name.endsWith('.test.ts')) out.push(full);
    }
    return out;
}

/** ファイル冒頭の /** ... *\/ コメントを説明文として取り出す（無ければ空配列）。 */
function headerComment(src) {
    const m = src.match(/^\s*\/\*\*([\s\S]*?)\*\//);
    if (!m) return [];
    return m[1]
        .split('\n')
        .map((l) => l.replace(/^\s*\*? ?/, '').trimEnd())
        .filter((l, i, arr) => !(l === '' && (i === 0 || i === arr.length - 1 || arr[i - 1] === '')));
}

const TITLE_RE = /^(\s*)(describe|suite|it|test)(?:\.(only|skip))?\s*\(\s*(['"`])((?:\\.|(?!\4).)*)\4/;

/**
 * 1 ファイル分のテストタイトルを抽出する。
 * インデント幅でグルーピング（describe → 見出し、it/test → 箇条書き）。
 */
function extractCases(src) {
    const items = [];
    for (const line of src.split('\n')) {
        const m = line.match(TITLE_RE);
        if (!m) continue;
        const [, indent, kind, modifier, , title] = m;
        items.push({
            group: kind === 'describe' || kind === 'suite',
            depth: Math.floor(indent.length / 4),
            skipped: modifier === 'skip',
            title: title.replace(/\\(['"`])/g, '$1')
        });
    }
    return items;
}

function renderFile(file) {
    const rel = path.relative(ROOT, file);
    const src = fs.readFileSync(file, 'utf8');
    const cases = extractCases(src);
    const testCount = cases.filter((c) => !c.group).length;
    const lines = [];
    lines.push(`### \`${rel}\`（${testCount} 件）`);
    lines.push('');
    const header = headerComment(src);
    if (header.length) {
        lines.push(...header.map((l) => (l ? `> ${l}` : '>')));
        lines.push('');
    }
    const minDepth = cases.length ? Math.min(...cases.map((c) => c.depth)) : 0;
    for (const c of cases) {
        const indent = '  '.repeat(Math.max(0, c.depth - minDepth));
        const mark = c.group ? `**${c.title}**` : c.skipped ? `~~${c.title}~~（skip）` : c.title;
        lines.push(`${indent}- ${mark}`);
    }
    lines.push('');
    return { text: lines.join('\n'), testCount };
}

function main() {
    const out = [];
    out.push('# Preview テストカタログ（ユースケース一覧）');
    out.push('');
    out.push('<!-- このファイルは自動生成。手で編集しない。`npm run docs:test-catalog` で再生成する。 -->');
    out.push('');
    out.push(`最終生成: ${new Date().toISOString().slice(0, 10)}`);
    out.push('');
    out.push('テストのタイトルは「この操作をしたら、こう動く」という仕様文として書かれている。');
    out.push('このカタログは全テストファイルからタイトルを抽出したもので、拡張機能が保証する');
    out.push('ユースケースの一覧（生きた仕様書）として読める。');
    out.push('');

    let grandTotal = 0;
    const sectionsText = [];
    for (const [i, sec] of SECTIONS.entries()) {
        const files = sec.files().filter((f) => fs.existsSync(f));
        const bodies = files.map(renderFile);
        const count = bodies.reduce((a, b) => a + b.testCount, 0);
        grandTotal += count;
        const lines = [];
        lines.push(`## ${i + 1}. ${sec.title} — ${count} 件`);
        lines.push('');
        lines.push(`実行: \`${sec.run}\``);
        lines.push('');
        lines.push(sec.note);
        lines.push('');
        lines.push(...bodies.map((b) => b.text));
        sectionsText.push(lines.join('\n'));
    }

    out.push(`**総テスト数: ${grandTotal} 件**`);
    out.push('');
    out.push(...sectionsText);

    fs.writeFileSync(OUT, out.join('\n'));
    console.log(`generated: ${path.relative(ROOT, OUT)} (${grandTotal} tests)`);
}

main();
