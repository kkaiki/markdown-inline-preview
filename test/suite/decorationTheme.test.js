const assert = require('assert');
const fs = require('fs');
const path = require('path');

// decoration定義をソースコードから静的に抽出して検証する
// VSCode APIへの依存なしでユニットテスト可能
const SRC_PATH = path.resolve(__dirname, '../../src/extension-markdown-inline.js');

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
            // headingDecorations = [...] の直後に続く createTextEditorDecorationType
            const allBlocks = extractDecorationOptions(src);
            const headingBlocks = allBlocks.filter(b =>
                b.includes('fontWeight') && b.includes('backgroundColor')
            );
            assert.ok(
                headingBlocks.length >= 6,
                `見出しデコレーションが6種類未満です (found: ${headingBlocks.length})`
            );
        });
    });
});
