// @ts-check
const tseslint = require('typescript-eslint');

module.exports = tseslint.config(
    // ── 対象ファイル ──────────────────────────────────────────
    {
        ignores: [
            '**/*.js',       // コンパイル済み JS は対象外
            '**/*.d.ts',     // 自動生成の型宣言ファイルは対象外
            'node_modules/',
            'out/',
            'test/',
            'build.js',
            'eslint.config.js',
        ],
    },

    // ── TypeScript 推奨ルール ──────────────────────────────────
    ...tseslint.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,

    // ── プロジェクト設定 ───────────────────────────────────────
    {
        languageOptions: {
            parserOptions: {
                project: './tsconfig.json',
                tsconfigRootDir: __dirname,
            },
        },
    },

    // ── カスタムルール ────────────────────────────────────────
    {
        rules: {
            // 必須レベル
            '@typescript-eslint/no-unused-vars': ['error', {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_',
                caughtErrorsIgnorePattern: '^_',
            }],
            '@typescript-eslint/no-floating-promises': 'error',
            'eqeqeq': ['error', 'always'],
            'no-console': 'warn',
            'prefer-const': 'error',

            // 推奨レベル
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/prefer-nullish-coalescing': 'warn',
            '@typescript-eslint/no-non-null-assertion': 'warn',
            '@typescript-eslint/consistent-type-imports': ['warn', {
                prefer: 'type-imports',
                fixStyle: 'inline-type-imports',
            }],

            // VSCode API は any を多用するため段階的に適用
            '@typescript-eslint/no-unsafe-assignment': 'off',
            '@typescript-eslint/no-unsafe-call': 'off',
            '@typescript-eslint/no-unsafe-member-access': 'off',
            '@typescript-eslint/no-unsafe-return': 'off',
            '@typescript-eslint/no-unsafe-argument': 'off',

            // CommonJS require を許可（tsconfig が commonjs のため）
            '@typescript-eslint/no-require-imports': 'off',
        },
    },
);
