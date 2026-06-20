import assert from 'assert';
import { stripPlaceholderLineBreaks } from '../../src/shared/markdown/lineBreaks';

describe('stripPlaceholderLineBreaks', () => {
    it('turns a standalone <br /> line into an empty line', () => {
        const input = '## 見出し\n<br />\n\n本文';
        const output = stripPlaceholderLineBreaks(input);
        assert.strictEqual(output, '## 見出し\n\n\n本文');
    });

    it('handles <br>, <br/>, <br /> variants', () => {
        assert.strictEqual(stripPlaceholderLineBreaks('<br>'), '');
        assert.strictEqual(stripPlaceholderLineBreaks('<br/>'), '');
        assert.strictEqual(stripPlaceholderLineBreaks('<br />'), '');
        assert.strictEqual(stripPlaceholderLineBreaks('  <br >  '), '');
    });

    it('empties placeholder cells in a table row', () => {
        const input = '| Header 1 | Header 2 |\n| --- | --- |\n| <br /> | <br /> |';
        const output = stripPlaceholderLineBreaks(input);
        assert.strictEqual(
            output,
            '| Header 1 | Header 2 |\n| --- | --- |\n|  |  |'
        );
    });

    it('keeps intentional inline <br /> inside text', () => {
        const input = 'foo<br />bar';
        assert.strictEqual(stripPlaceholderLineBreaks(input), 'foo<br />bar');
    });

    it('keeps inline <br /> inside a non-empty cell', () => {
        const input = '| a<br />b | c |';
        assert.strictEqual(stripPlaceholderLineBreaks(input), '| a<br />b | c |');
    });

    it('leaves normal markdown untouched', () => {
        const input = '# Title\n\n- item\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n';
        assert.strictEqual(stripPlaceholderLineBreaks(input), input);
    });
});
