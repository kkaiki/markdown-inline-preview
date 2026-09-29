// Marp スライド書き出し（PRO+）用の別バンドル out/marp.js を作る。
//
// 拡張本体（out/extension.js）に入れると起動のたびに 1 MB を読むので、書き出し時にだけ require する別ファイルにする。
// marp-core をそのまま入れると MathJax と highlight.js の全言語で 3.9 MB になるため:
//   - mathjax-full を空モジュールに差し替える（数式は同梱の KaTeX で描く）
//   - highlight.js の言語を主要なものに絞る（ほかの言語のコードはハイライトなしで表示）
// 設計: docs/private/specifications/pro-marp-export.md §2・§3.3（上限は test/suite/shared/marpBundle.test.ts）
import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const KEEP_LANGUAGES = new Set([
    'bash', 'c', 'cpp', 'csharp', 'css', 'diff', 'dockerfile', 'go', 'graphql', 'ini', 'java', 'javascript',
    'json', 'kotlin', 'less', 'lua', 'makefile', 'markdown', 'objectivec', 'perl', 'php', 'php-template',
    'plaintext', 'python', 'python-repl', 'r', 'ruby', 'rust', 'scss', 'shell', 'sql', 'swift', 'typescript',
    'vbnet', 'wasm', 'xml', 'yaml'
]);

const slim = {
    name: 'marp-slim',
    setup(build) {
        build.onResolve({ filter: /^mathjax-full\// }, (args) => ({ path: args.path, namespace: 'stub-mathjax' }));
        build.onLoad({ filter: /.*/, namespace: 'stub-mathjax' }, () => ({ contents: 'module.exports = {};', loader: 'js' }));
        build.onResolve({ filter: /^highlight\.js\/lib\/languages\// }, (args) => {
            const language = args.path.split('/').pop();
            if (KEEP_LANGUAGES.has(language)) return undefined;
            return { path: language, namespace: 'stub-hljs' };
        });
        build.onLoad({ filter: /.*/, namespace: 'stub-hljs' }, () => ({
            contents: 'module.exports = function () { return { disableAutodetect: true, contains: [] }; };',
            loader: 'js'
        }));
    }
};

const outfile = path.join(root, 'out', 'marp.js');
await esbuild.build({
    entryPoints: [path.join(root, 'src', 'shared', 'marp', 'marpHtml.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    // VS Code 1.74 の拡張ホスト（Node 16）でも読めるように下げる
    target: 'node16',
    minify: true,
    outfile,
    plugins: [slim],
    logLevel: 'warning'
});
console.log(`out/marp.js ${(fs.statSync(outfile).size / 1024).toFixed(0)} KB`);
