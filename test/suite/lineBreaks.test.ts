import assert from 'assert';
import { stripPlaceholderLineBreaks, tightenListSpacing } from '../../src/shared/markdown/lineBreaks';

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

describe('tightenListSpacing', () => {
    it('removes blank lines between checkbox items', () => {
        const input = '* [ ] a\n\n* [ ] b\n\n* [ ] c';
        assert.strictEqual(tightenListSpacing(input), '* [ ] a\n* [ ] b\n* [ ] c');
    });

    it('removes blank lines between bullets and numbered items', () => {
        assert.strictEqual(tightenListSpacing('- a\n\n- b'), '- a\n- b');
        assert.strictEqual(tightenListSpacing('1. a\n\n2. b'), '1. a\n2. b');
    });

    it('keeps blank lines around non-list paragraphs', () => {
        const input = '- a\n\nparagraph\n\n- b';
        assert.strictEqual(tightenListSpacing(input), input);
    });

    it('tightens nested items too', () => {
        const input = '* [ ] a\n\n  * [ ] nested\n\n* [ ] b';
        assert.strictEqual(tightenListSpacing(input), '* [ ] a\n  * [ ] nested\n* [ ] b');
    });

    it('does not touch blank lines inside a fenced code block', () => {
        const input = '```\n- a\n\n- b\n```';
        assert.strictEqual(tightenListSpacing(input), input);
    });

    it('leaves an already-tight list unchanged', () => {
        const input = '- a\n- b\n- c\n';
        assert.strictEqual(tightenListSpacing(input), input);
    });
});
