// @ts-check
const tseslint = require('typescript-eslint');

module.exports = tseslint.config(
    {
        ignores: [
            '**/*.js',
            '**/*.d.ts',
            'node_modules/',
            'out/',
            'out-test/',
            'build.ts',
            'eslint.config.js',
        ],
    },

    ...tseslint.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,

    {
        languageOptions: {
            parserOptions: {
                project: './tsconfig.json',
                tsconfigRootDir: __dirname,
            },
        },
    },

    {
        files: ['src/preview/webview/**/*.ts'],
        languageOptions: {
            parserOptions: {
                project: './tsconfig.webview.json',
                tsconfigRootDir: __dirname,
            },
        },
    },

    {
        files: ['test/**/*.ts'],
        languageOptions: {
            parserOptions: {
                project: './tsconfig.test.json',
                tsconfigRootDir: __dirname,
            },
        },
    },

    {
        // test/webview は tsconfig.test.json から除外しているため専用 project を使う
        files: ['test/webview/**/*.ts'],
        languageOptions: {
            parserOptions: {
                project: './tsconfig.webview-test.json',
                tsconfigRootDir: __dirname,
            },
        },
    },

    {
        // test/browser も tsconfig.test.json から除外しているため専用 project を使う
        files: ['test/browser/**/*.ts'],
        languageOptions: {
            parserOptions: {
                project: './tsconfig.browser-test.json',
                tsconfigRootDir: __dirname,
            },
        },
    },

    {
        rules: {
            '@typescript-eslint/no-unused-vars': ['error', {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_',
                caughtErrorsIgnorePattern: '^_',
            }],
            '@typescript-eslint/no-floating-promises': 'error',
            'eqeqeq': ['error', 'always'],
            'no-console': 'warn',
            'prefer-const': 'error',

            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/prefer-nullish-coalescing': 'warn',
            '@typescript-eslint/no-non-null-assertion': 'warn',
            '@typescript-eslint/consistent-type-imports': ['warn', {
                prefer: 'type-imports',
                fixStyle: 'inline-type-imports',
            }],

            '@typescript-eslint/no-unsafe-assignment': 'off',
            '@typescript-eslint/no-unsafe-call': 'off',
            '@typescript-eslint/no-unsafe-member-access': 'off',
            '@typescript-eslint/no-unsafe-return': 'off',
            '@typescript-eslint/no-unsafe-argument': 'off',
            '@typescript-eslint/no-require-imports': 'off',
        },
    },

    {
        files: ['test/**/*.ts'],
        rules: {
            '@typescript-eslint/no-unused-vars': 'off',
            '@typescript-eslint/prefer-nullish-coalescing': 'off',
            '@typescript-eslint/no-floating-promises': 'off',
            'prefer-const': 'off',
            'no-console': 'off',
        },
    },

    // ヘキサゴナル境界の強制（ADR-0001）:
    // src/shared/** は「純粋コア」。UI/ホストのフレームワークに依存してはいけない。
    // - vscode: 実体も型も全面禁止（コアは VS Code API を一切知らない）。
    // - @milkdown/*: 実体（runtime）の import は禁止。ProseMirror の「型のみ」は当面許可
    //   （allowTypeImports）。型依存も無くしたい場合は該当ヘルパを src/preview/webview へ
    //   移設する（ADR-0001 の follow-up を参照）。
    {
        files: ['src/shared/**/*.ts'],
        rules: {
            'no-restricted-imports': 'off',
            '@typescript-eslint/no-restricted-imports': ['error', {
                patterns: [
                    {
                        group: ['vscode', 'vscode/*'],
                        message:
                            'src/shared は純粋コアです。VS Code API（型を含む）に依存できません。' +
                            'VS Code 連携はアダプタ層（src/raw / src/preview/host）で行ってください。',
                    },
                    {
                        group: ['@milkdown', '@milkdown/*', '@milkdown/**'],
                        allowTypeImports: true,
                        message:
                            'src/shared は純粋コアです。Milkdown/ProseMirror の実体（runtime）に依存できません。' +
                            '型のみ `import type` で参照可。WYSIWYG 連携は src/preview/webview のアダプタ側へ。',
                    },
                ],
            }],
        },
    },
);
