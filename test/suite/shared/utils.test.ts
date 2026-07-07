import assert from 'assert';
import {
    getAdvancedBooleanSetting,
    getAdvancedOrLegacyBooleanSetting
} from '../../../src/core/config';
import {
    parseSlashCommandLine,
    parseHeadingSlashCommand,
    parseTableNormalizeSlashCommand,
    buildHeadingLine,
    createDefaultTableTemplate
} from '../../../src/raw/completion/slashCommands';
import { generateSlug } from '../../../src/shared/markdown/slug';
import {
    getIndentString,
    getIndentLevel,
    createIndent,
    getListType,
    convertLineToType,
    toggleCheckboxState,
    calculateBlockRange,
    getListContinuationMarker
} from '../../../src/shared/structure/list';
import {
    collectHeadingsFromText
} from '../../../src/shared/structure/toc';
import {
    splitTableLine,
    getAllTableCells,
    getTableCellInfo
} from '../../../src/shared/table/table';
import {
    isFullWidthCodePoint,
    getStringWidth,
    padCell
} from '../../../src/shared/table/width';

describe('Shared Module Integration', function() {
    describe('Width Utils', function() {
        it('should calculate string width correctly', function() {
            assert.strictEqual(getStringWidth('Hello'), 5);
            assert.strictEqual(getStringWidth('日本語'), 6);
            assert.strictEqual(getStringWidth('Hello日本'), 9);
        });

        it('should pad cells correctly', function() {
            const result = padCell('A', 5);
            assert.strictEqual(result.includes('A'), true);
            assert.strictEqual(result.length >= 5, true);
        });

        it('should detect full width characters', function() {
            assert.strictEqual(isFullWidthCodePoint('日'.codePointAt(0)), true);
            assert.strictEqual(isFullWidthCodePoint('A'.codePointAt(0)), false);
        });
    });

    describe('Table Utils', function() {
        it('should split table line', function() {
            const result = splitTableLine('| A | B | C |');
            assert.deepStrictEqual(result, ['A', 'B', 'C']);
        });

        it('should get all table cells', function() {
            const result = getAllTableCells('| A | B |');
            assert.strictEqual(result.length, 2);
            assert.strictEqual(result[0].index, 0);
            assert.strictEqual(result[1].index, 1);
        });

        it('should get table cell info', function() {
            const result = getTableCellInfo('| A | B |', 2);
            assert.strictEqual(result.isTable, true);
            assert.strictEqual(result.cellIndex, 0);
        });

        it('should move to first non-space character for non-empty cells', function() {
            const result = getTableCellInfo('|   ABC   |', 4);
            assert.strictEqual(result.cellContentStart, 4);
            assert.strictEqual(result.cellStart, 1);
        });

        it('should use cell start for whitespace-only cells', function() {
            const result = getTableCellInfo('|     |', 2);
            assert.strictEqual(result.cellContentStart, result.cellStart);
            assert.strictEqual(result.cellContentEnd, result.cellStart);
        });
    });

    describe('TOC Utils', function() {
        it('should generate slug', function() {
            assert.strictEqual(generateSlug('Hello World'), 'hello-world');
            assert.strictEqual(generateSlug('日本語').includes('日本語'), true);
        });

        it('should collect headings from text', function() {
            const text = '# Title\n## Section\nText\n### Sub';
            const headings = collectHeadingsFromText(text);
            assert.strictEqual(headings.length, 3);
        });
    });

    describe('Slash Command Utils', function() {
        it('should parse slash command line', function() {
            const result = parseSlashCommandLine('/heading 2 仕様');
            assert.ok(result);
            assert.strictEqual(result.command, 'heading');
            assert.strictEqual(result.argsText, '2 仕様');
            assert.deepStrictEqual(result.args, ['2', '仕様']);
        });

        it('should parse heading slash command', function() {
            const result = parseHeadingSlashCommand('3 使い方');
            assert.ok(result);
            assert.strictEqual(result.level, 3);
            assert.strictEqual(result.title, '使い方');
        });

        it('should default heading slash command to level 1', function() {
            const result = parseHeadingSlashCommand('');
            assert.ok(result);
            assert.strictEqual(result.level, 1);
            assert.strictEqual(result.title, '');
        });

        it('should parse table normalize slash command', function() {
            assert.strictEqual(parseTableNormalizeSlashCommand('normalize on'), true);
            assert.strictEqual(parseTableNormalizeSlashCommand('normilize off'), false);
            assert.strictEqual(parseTableNormalizeSlashCommand('normalize maybe'), null);
        });

        it('should build heading line', function() {
            assert.strictEqual(buildHeadingLine(2, '仕様'), '## 仕様');
            assert.strictEqual(buildHeadingLine(1, ''), '# ');
        });

        it('should create default table template', function() {
            const template = createDefaultTableTemplate();
            assert.deepStrictEqual(template, [
                '|  |  |',
                '| --- | --- |',
                '|  |  |'
            ]);
        });
    });

    describe('List Utils', function() {
        it('should get indent string', function() {
            assert.strictEqual(getIndentString('  - Item'), '  ');
            assert.strictEqual(getIndentString('Item'), '');
        });

        it('should get indent level', function() {
            assert.strictEqual(getIndentLevel(''), 0);
            assert.strictEqual(getIndentLevel('  '), 1);
            assert.strictEqual(getIndentLevel('    '), 2);
            assert.strictEqual(getIndentLevel('\t'), 1);
        });

        it('should create indent', function() {
            assert.strictEqual(createIndent(1), '  ');
            assert.strictEqual(createIndent(2), '    ');
            assert.strictEqual(createIndent(1, true), '\t');
        });

        it('should get list type', function() {
            assert.strictEqual(getListType('- [ ] Task'), 'checkbox');
            assert.strictEqual(getListType('1. Item'), 'numbered');
            assert.strictEqual(getListType('- Item'), 'bullet');
            assert.strictEqual(getListType('Normal'), null);
        });

        it('should convert line to type', function() {
            assert.strictEqual(convertLineToType('- Item', 'numbered'), '1. Item');
            assert.strictEqual(convertLineToType('1. Item', 'bullet'), '- Item');
            assert.strictEqual(convertLineToType('- Item', 'checkbox'), '- [ ] Item');
        });

        it('should toggle checkbox state', function() {
            assert.strictEqual(toggleCheckboxState('- [ ] Task'), '- [x] Task');
            assert.strictEqual(toggleCheckboxState('- [x] Done'), '- [ ] Done');
        });

        it('should calculate block range', function() {
            const lines = ['- Parent', '  - Child', '  - Child2', '- Next'];
            const range = calculateBlockRange(lines, 0);
            assert.strictEqual(range.start, 0);
            assert.strictEqual(range.end, 2);
        });

        it('should get list continuation marker', function() {
            assert.strictEqual(getListContinuationMarker('- Item'), '- ');
            assert.strictEqual(getListContinuationMarker('1. Item'), '2. ');
            assert.strictEqual(getListContinuationMarker('- [ ] Task'), '- [ ] ');
        });
    });

    describe('Settings Utils', function() {
        function createConfig(values = {}, inspected = {}) {
            return {
                get(key, defaultValue) {
                    return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : defaultValue;
                },
                inspect(key) {
                    return inspected[key];
                }
            };
        }

        it('should read advanced boolean settings directly', function() {
            const config = createConfig({ 'advanced.autoFormatTables': false });
            assert.strictEqual(getAdvancedBooleanSetting(config, 'autoFormatTables', true), false);
        });

        it('should prefer legacy value when advanced setting is not explicitly set', function() {
            const config = createConfig({ 'enableHeadingDecorations': false });
            assert.strictEqual(
                getAdvancedOrLegacyBooleanSetting(
                    config,
                    'enableHeadingDecorations',
                    'enableHeadingDecorations',
                    true
                ),
                false
            );
        });

        it('should prefer explicit advanced value over legacy value', function() {
            const config = createConfig(
                {
                    'advanced.enableHeadingDecorations': true,
                    'enableHeadingDecorations': false
                },
                {
                    'advanced.enableHeadingDecorations': { workspaceValue: true }
                }
            );

            assert.strictEqual(
                getAdvancedOrLegacyBooleanSetting(
                    config,
                    'enableHeadingDecorations',
                    'enableHeadingDecorations',
                    false
                ),
                true
            );
        });
    });
});
