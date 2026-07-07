/**
 * Raw モードの装飾（decoration）テスト。
 *
 * 前半: decoration の色・スタイル定義をソースから静的抽出して検証（VSCode API 不要）。
 * 後半: decoration が「どのテキスト範囲」に付くかを検証する。`src/raw/decorations/updaters.ts`
 * は `vscode.Range`/`vscode.Position` に依存し実 VS Code 拡張ホストが無いと import できないため、
 * このプロジェクトの test/suite/raw/ の慣習（本ファイル以外の raw ユニットテストも同様）に
 * 倣い、同じ正規表現・同じ範囲計算ロジックを `vscode` 型に依存しない純関数として複製し、
 * 行・列単位で範囲が一致するかを検証する。updaters.ts の該当ロジックを変更したら、
 * ここの複製もあわせて更新すること。
 */
import assert from "assert";
import fs from "fs";
import path from "path";

// decoration定義をソースコードから静的に抽出して検証する
// VSCode APIへの依存なしでユニットテスト可能
const SRC_PATH = path.resolve(__dirname, '../../../../../src/raw/decorations/factory.ts');
const HEADING_SCHEMES_PATH = path.resolve(__dirname, '../../../../../src/raw/decorations/headingSchemes.ts');

interface Range { line: number; start: number; end: number; }

/** src/raw/decorations/updaters.ts の checkedDecoration 範囲計算（`- [x] label` の label 部分）と同一ロジック。 */
function checkedCheckboxRanges(lines: string[]): Range[] {
    const ranges: Range[] = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const match = line.match(/^\s*-\s\[[xX]\]\s*/);
        if (match) {
            const startPos = match[0].length;
            if (startPos < line.length) {
                ranges.push({ line: i, start: startPos, end: line.length });
            }
        }
    }
    return ranges;
}

/** updateHeadingDecorations と同一ロジック。戻り値は見出しレベル(1-6)ごとの範囲。 */
function headingRanges(lines: string[]): Array<Range & { level: number }> {
    const results: Array<Range & { level: number }> = [];
    for (let i = 0; i < lines.length; i++) {
        const lineText = lines[i];
        const m = lineText.match(/^(#{1,6})\s+.+/);
        if (!m) continue;
        const level = Math.min(m[1].length, 6);
        results.push({ line: i, start: 0, end: lineText.length, level });
    }
    return results;
}

/** updateHorizontalRuleDecorations と同一ロジック。 */
function horizontalRuleRanges(lines: string[]): Range[] {
    const ranges: Range[] = [];
    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
            ranges.push({ line: i, start: 0, end: lines[i].length });
        }
    }
    return ranges;
}

interface BlockRange { startLine: number; startCol: number; endLine: number; endCol: number; }

/** updateCodeBlockDecorations の背景範囲計算と同一ロジック（``` フェンス間、未終端フェンスも含む）。 */
function codeBlockBackgroundRanges(lines: string[]): BlockRange[] {
    const ranges: BlockRange[] = [];
    let inFence = false;
    let fenceStart = -1;
    for (let i = 0; i < lines.length; i++) {
        const lineText = lines[i];
        if (lineText.startsWith('```')) {
            if (!inFence) {
                inFence = true;
                fenceStart = i;
            } else {
                if (fenceStart >= 0) {
                    ranges.push({ startLine: fenceStart, startCol: 0, endLine: i, endCol: lineText.length });
                }
                inFence = false;
                fenceStart = -1;
            }
        }
    }
    if (inFence && fenceStart >= 0) {
        const lastLine = lines.length - 1;
        ranges.push({ startLine: fenceStart, startCol: 0, endLine: lastLine, endCol: lines[lastLine].length });
    }
    return ranges;
}

/** getSyntaxRanges の python/javascript パターン抜粋。updaters.ts の languagePatterns と同一の正規表現。 */
const LANGUAGE_PATTERNS: Record<string, Record<string, RegExp>> = {
    python: {
        keyword: /\b(def|class|if|else|elif|for|while|return|import|from|as|try|except|finally|with|lambda|yield|assert|break|continue|pass|raise|global|nonlocal|del|is|in|not|and|or|None|True|False)\b/g,
        string: /(["'])(?:(?=(\\?))\2.)*?\1/g,
        comment: /#.*/g,
        number: /\b\d+(\.\d+)?\b/g,
        function: /\b[a-zA-Z_][a-zA-Z0-9_]*(?=\s*\()/g
    },
    javascript: {
        keyword: /\b(function|var|let|const|if|else|for|while|return|import|export|from|class|extends|new|try|catch|finally|throw|async|await|yield|typeof|instanceof|in|of|this|super|static|get|set|constructor|break|continue|switch|case|default|do|void|delete|debugger)\b/g,
        string: /(["'`])(?:(?=(\\?))\2.)*?\1/g,
        comment: /(\/\/.*|\/\*[\s\S]*?\*\/)/g,
        number: /\b\d+(\.\d+)?\b/g
    }
};

function syntaxRanges(lines: string[], language: string, startLine: number, endLine: number): Map<string, Range[]> {
    const result = new Map<string, Range[]>();
    const patterns = LANGUAGE_PATTERNS[language];
    for (let lineNum = startLine; lineNum <= endLine && lineNum < lines.length; lineNum++) {
        const lineText = lines[lineNum];
        for (const [tokenType, pattern] of Object.entries(patterns)) {
            pattern.lastIndex = 0;
            let match: RegExpExecArray | null;
            while ((match = pattern.exec(lineText)) !== null) {
                if (!result.has(tokenType)) result.set(tokenType, []);
                result.get(tokenType)?.push({ line: lineNum, start: match.index, end: match.index + match[0].length });
            }
        }
    }
    return result;
}

function extractDecorationOptions(src) {
    // createTextEditorDecorationType({...}) の引数オブジェクトをすべて抽出
    const results = [];
    const re = /createTextEditorDecorationType\s*\((\{[\s\S]*?\})\s*\)/g;
    let m;
    while ((m = re.exec(src)) !== null) {
        results.push(m[1]);
    }
    return results;
}

function findCodeBlockDecoration(src) {
    // isWholeLine: true かつ backgroundColor を持つブロックを探す
    const re = /createTextEditorDecorationType\s*\(\s*(\{[\s\S]*?\})\s*\)/g;
    let m;
    while ((m = re.exec(src)) !== null) {
        const block = m[1];
        if (block.includes('isWholeLine: true') && block.includes('backgroundColor')) {
            return block;
        }
    }
    return null;
}

describe('Decoration Theme', function () {
    let src;

    before(function () {
        src = fs.readFileSync(SRC_PATH, 'utf8');
    });

    describe('codeBlock decoration', function () {
        it('should define light and dark backgroundColor variants', function () {
            const block = findCodeBlockDecoration(src);
            assert.ok(block, 'codeBlock decoration (isWholeLine+backgroundColor) が見つかりません');
            assert.ok(
                block.includes('light:') && block.includes('dark:'),
                'light/dark の両バリアントが定義されていません\n' + block
            );
        });

        it('light backgroundColor should be light (low alpha or white-based)', function () {
            const block = findCodeBlockDecoration(src);
            assert.ok(block, 'codeBlock decoration が見つかりません');
            // light: { backgroundColor: 'rgba(R, G, B, A)' } を抽出
            const lightSection = block.match(/light\s*:\s*\{[\s\S]*?\}/);
            assert.ok(lightSection, 'light セクションが見つかりません');
            const rgbaMatch = lightSection[0].match(/rgba\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/);
            assert.ok(rgbaMatch, 'light backgroundColor に rgba() が見つかりません');
            const alpha = parseFloat(rgbaMatch[4]);
            // light テーマ向けなので alpha は 0.3 未満であるべき（薄い）
            assert.ok(alpha < 0.3, `light 背景のアルファ値 (${alpha}) が大きすぎます — ライトテーマで背景が暗くなります`);
        });

        it('dark backgroundColor should be dark (high alpha or dark-based)', function () {
            const block = findCodeBlockDecoration(src);
            assert.ok(block, 'codeBlock decoration が見つかりません');
            const darkSection = block.match(/dark\s*:\s*\{[\s\S]*?\}/);
            assert.ok(darkSection, 'dark セクションが見つかりません');
            const rgbaMatch = darkSection[0].match(/rgba\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/);
            assert.ok(rgbaMatch, 'dark backgroundColor に rgba() が見つかりません');
            const [, r, g, b, alpha] = rgbaMatch.map(Number);
            // dark テーマ向けなので輝度が低いか alpha が高い
            const luminance = (r + g + b) / 3;
            assert.ok(
                luminance < 100 || alpha >= 0.5,
                `dark 背景の色 rgba(${r},${g},${b},${alpha}) がダークテーマに適していません`
            );
        });

        it('should NOT use a single hardcoded dark backgroundColor without light/dark split', function () {
            // 旧バグ: light: / dark: なしで暗い backgroundColor が直書きされていると
            // ライトテーマでも黒背景になる
            const block = findCodeBlockDecoration(src);
            assert.ok(block, 'codeBlock decoration が見つかりません');
            // light:/dark: の外側にある直接 backgroundColor があれば問題
            const withoutThemeVariants = block
                .replace(/light\s*:\s*\{[\s\S]*?\}/g, '')
                .replace(/dark\s*:\s*\{[\s\S]*?\}/g, '');
            const hasBareBackground = /backgroundColor\s*:/.test(withoutThemeVariants);
            assert.ok(
                !hasBareBackground,
                'light/dark バリアント外に backgroundColor が直書きされています — ライトテーマで背景が黒くなります'
            );
        });
    });

    describe('horizontalRule decoration', function () {
        it('should have light and dark borderColor variants', function () {
            // isWholeLine: true かつ borderStyle を持つブロック
            const re = /createTextEditorDecorationType\s*\(\s*(\{[\s\S]*?\})\s*\)/g;
            let m, hrBlock;
            while ((m = re.exec(src)) !== null) {
                const b = m[1];
                if (b.includes('isWholeLine: true') && b.includes('borderStyle')) {
                    hrBlock = b;
                    break;
                }
            }
            assert.ok(hrBlock, 'horizontalRule decoration が見つかりません');
            assert.ok(hrBlock.includes('light:'), 'light バリアントがありません');
            assert.ok(hrBlock.includes('dark:'), 'dark バリアントがありません');
        });
    });

    describe('heading decorations', function () {
        it('should define at least 6 heading levels', function () {
            const headingSrc = fs.readFileSync(HEADING_SCHEMES_PATH, 'utf8');
            const levelMatches = headingSrc.match(/fontWeight:/g) ?? [];
            assert.ok(
                levelMatches.length >= 6,
                `見出しデコレーションが6種類未満です (found: ${levelMatches.length})`
            );
            assert.ok(headingSrc.includes('default'), 'default scheme が定義されていません');
            assert.ok(headingSrc.includes('monochrome'), 'monochrome scheme が定義されていません');
            assert.ok(headingSrc.includes('vibrant'), 'vibrant scheme が定義されていません');
        });
    });

    describe('Decoration range computation（適用されるテキスト範囲）', function () {
        describe('チェック済みチェックボックスの取り消し線範囲', function () {
            it('マーカー "- [x] " を除いたラベル部分だけに範囲が付く', function () {
                const ranges = checkedCheckboxRanges(['- [x] done task']);
                assert.deepStrictEqual(ranges, [{ line: 0, start: 6, end: 15 }]);
            });

            it('ネストしたチェック済み項目でもインデント込みのマーカー直後から範囲が始まる', function () {
                const ranges = checkedCheckboxRanges(['  - [X] nested done']);
                assert.deepStrictEqual(ranges, [{ line: 0, start: 8, end: 19 }]);
            });

            it('未チェック "- [ ]" には範囲が付かない', function () {
                const ranges = checkedCheckboxRanges(['- [ ] todo']);
                assert.deepStrictEqual(ranges, []);
            });

            it('ラベルが空（"- [x] " のみ）の行には範囲が付かない（startPos < line.length を満たさない）', function () {
                const ranges = checkedCheckboxRanges(['- [x] ']);
                assert.deepStrictEqual(ranges, []);
            });
        });

        describe('見出しの範囲とレベル判定', function () {
            it('# 〜 ###### の各行が行頭から行末までの範囲で、正しいレベルに割り当てられる', function () {
                const ranges = headingRanges(['# H1', '## H2', '###### H6']);
                assert.deepStrictEqual(ranges, [
                    { line: 0, start: 0, end: 4, level: 1 },
                    { line: 1, start: 0, end: 5, level: 2 },
                    { line: 2, start: 0, end: 9, level: 6 }
                ]);
            });

            it('# の後にスペースが無い行は見出しとして扱われない', function () {
                assert.deepStrictEqual(headingRanges(['#NotAHeading']), []);
            });

            it('# が7つ以上連続する行は見出しとして扱われない（無効な Markdown 見出し）', function () {
                assert.deepStrictEqual(headingRanges(['####### seven hashes']), []);
            });
        });

        describe('水平線（hr）の範囲', function () {
            it('--- / *** / ___ の行は行全体が範囲になる', function () {
                const ranges = horizontalRuleRanges(['---', '***', '___']);
                assert.deepStrictEqual(ranges, [
                    { line: 0, start: 0, end: 3 },
                    { line: 1, start: 0, end: 3 },
                    { line: 2, start: 0, end: 3 }
                ]);
            });

            it('ハイフンの間にスペースがある "- - -" は水平線として扱われない', function () {
                assert.deepStrictEqual(horizontalRuleRanges(['- - -']), []);
            });
        });

        describe('コードブロック背景の範囲', function () {
            it('開始 ``` 行の先頭から終了 ``` 行の末尾までが範囲になる', function () {
                const ranges = codeBlockBackgroundRanges(['```js', 'const x = 1;', '```']);
                assert.deepStrictEqual(ranges, [{ startLine: 0, startCol: 0, endLine: 2, endCol: 3 }]);
            });

            it('閉じフェンスが無い場合は文書末尾までが範囲になる（未終端フェンス）', function () {
                const lines = ['```js', 'const x = 1;'];
                const ranges = codeBlockBackgroundRanges(lines);
                assert.deepStrictEqual(ranges, [{ startLine: 0, startCol: 0, endLine: 1, endCol: 'const x = 1;'.length }]);
            });
        });

        describe('コードブロック内シンタックスハイライトの範囲', function () {
            it('python の keyword / string / comment / number / function 各トークンが正しい列位置で検出される', function () {
                const ranges = syntaxRanges(['def foo(x):', "    return 'hi'  # comment", '    n = 42'], 'python', 0, 2);
                const keyword = ranges.get('keyword') ?? [];
                assert.ok(
                    keyword.some(r => r.line === 0 && r.start === 0 && r.end === 3),
                    `def の keyword 範囲が見つからない: ${JSON.stringify(keyword)}`
                );
                assert.ok(
                    keyword.some(r => r.line === 1 && r.start === 4 && r.end === 10),
                    `return の keyword 範囲が見つからない: ${JSON.stringify(keyword)}`
                );
                const fn = ranges.get('function') ?? [];
                assert.deepStrictEqual(fn, [{ line: 0, start: 4, end: 7 }]);
                const str = ranges.get('string') ?? [];
                assert.deepStrictEqual(str, [{ line: 1, start: 11, end: 15 }]);
                const comment = ranges.get('comment') ?? [];
                assert.deepStrictEqual(comment, [{ line: 1, start: 17, end: 26 }]);
                const num = ranges.get('number') ?? [];
                assert.deepStrictEqual(num, [{ line: 2, start: 8, end: 10 }]);
            });

            it('startLine/endLine の範囲外の行はトークン抽出の対象にならない', function () {
                const lines = ['const before = 1;', 'const inRange = 2;', 'const after = 3;'];
                const ranges = syntaxRanges(lines, 'javascript', 1, 1);
                const num = ranges.get('number') ?? [];
                assert.deepStrictEqual(num, [{ line: 1, start: 16, end: 17 }]);
            });
        });
    });
});
