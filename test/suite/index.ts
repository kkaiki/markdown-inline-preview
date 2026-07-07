import path from 'path';
import Mocha from 'mocha';
import glob from 'glob';

export function run(): Promise<void> {
    const mocha = new Mocha({
        ui: 'tdd',
        color: true,
        timeout: 10000,
        // MOCHA_GREP でテスト名の絞り込み（runTest.ts の extensionTestsEnv 経由で届く）
        grep: process.env.MOCHA_GREP || undefined
    });

    const testsRoot = path.resolve(__dirname, '..');

    return new Promise((resolve, reject) => {
        // 実 VS Code は1回だけ起動し、その同じインスタンス内で extension/ 配下の
        // 全テストファイル（raw.test.js / preview.test.js …）を連続実行する。
        glob('extension/**/*.test.js', { cwd: testsRoot }, (err: Error | null, files: string[]) => {
            if (err) {
                return reject(err);
            }

            files.forEach((f: string) => mocha.addFile(path.resolve(testsRoot, f)));

            try {
                mocha.run(failures => {
                    if (failures > 0) {
                        reject(new Error(`${failures} tests failed.`));
                    } else {
                        resolve();
                    }
                });
            } catch (runErr) {
                const error = runErr instanceof Error ? runErr : new Error(String(runErr));
                reject(error);
            }
        });
    });
}
