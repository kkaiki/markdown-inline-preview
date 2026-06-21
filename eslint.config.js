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
);
