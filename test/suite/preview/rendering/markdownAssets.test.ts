import * as assert from 'assert';
import {
    prepareMarkdownImagesForWebview,
    restoreMarkdownImagesFromWebview
} from '../../../../src/preview/host/markdownTransform';

describe('markdownAssets', () => {
    const fakeWebview = {
        asWebviewUri(filePath: string): string {
            return `webview://${filePath}`;
        }
    };

    it('rewrites relative image paths and restores them', () => {
        const source = '![logo](./images/logo.png)\n\nText';
        const { markdown, uriMap } = prepareMarkdownImagesForWebview(
            source,
            '/workspace/docs/readme.md',
            fakeWebview
        );

        assert.ok(markdown.includes('webview://'));
        assert.ok(!markdown.includes('./images/logo.png'));
        assert.strictEqual(uriMap.size, 1);

        const roundTrip = restoreMarkdownImagesFromWebview(markdown, uriMap);
        assert.strictEqual(roundTrip, source);
    });

    it('leaves absolute URLs unchanged', () => {
        const source = '![remote](https://example.com/a.png)';
        const { markdown, uriMap } = prepareMarkdownImagesForWebview(
            source,
            '/workspace/docs/readme.md',
            fakeWebview
        );
        assert.strictEqual(markdown, source);
        assert.strictEqual(uriMap.size, 0);
    });
});
