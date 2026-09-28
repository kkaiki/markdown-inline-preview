import fs from "fs";
import path from "path";

import { runTests } from "@vscode/test-electron";

async function main() {
    try {
        // The folder containing the Extension Manifest package.json
        // Passed to `--extensionDevelopmentPath`
        const extensionDevelopmentPath = path.resolve(__dirname, '../../');

        // The path to the extension test script
        // Passed to --extensionTestsPath
        const extensionTestsPath = path.resolve(__dirname, './suite/index');

        /*
         * 実行のたびにユーザー設定を空に戻してから起動する。プロファイル（`.vscode-test/user-data`）は
         * 実行をまたいで残るため、テストが Global に書いた設定（例: 8.5 の「/table normalize on」→
         * advanced.autoFormatTables）が次の実行へ持ち越され、無関係なテスト（8.3 など）が落ちていた
         * （2026-09-29 に特定）。プロファイルごと作り直すと初回起動の準備で遅くなり、タイムアウトが
         * 多発したので、設定ファイルだけを戻す。
         */
        const userDataDir = path.resolve(__dirname, '../../.vscode-test/user-data');
        const userSettings = path.join(userDataDir, 'User', 'settings.json');
        fs.mkdirSync(path.dirname(userSettings), { recursive: true });
        fs.writeFileSync(userSettings, '{}\n');

        // Download VS Code, unzip it and run the integration test
        await runTests({
            /*
             * VS Code 1.132 以降は macOS の実行ファイル名が `Electron` → `Code` に変わり、
             * @vscode/test-electron 2.5.2 は起動できない（spawn ENOENT / SIGKILL）。
             * ランナーを上げるまでは、起動できる版を明示する。
             */
            version: process.env.VSCODE_TEST_VERSION ?? '1.96.0',
            extensionDevelopmentPath,
            extensionTestsPath,
            launchArgs: ['--disable-extensions', `--user-data-dir=${userDataDir}`], // 他の拡張機能を無効化
            // MOCHA_GREP='12\.' のようにテスト名で絞り込める（suite/index.ts が読む）
            extensionTestsEnv: process.env.MOCHA_GREP ? { MOCHA_GREP: process.env.MOCHA_GREP } : undefined
        });
    } catch (err) {
        process.stderr.write(`Failed to run tests: ${String(err)}\n`);
        process.exit(1);
    }
}

void main();
