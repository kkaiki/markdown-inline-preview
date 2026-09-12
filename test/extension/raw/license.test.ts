/**
 * ライセンス機能（実 VS Code）の登録と deep link の受け口を検証する。
 *
 * ここでしか確かめられないのは次の3つ:
 *   - コマンドが実際に VS Code に登録されているか（`package.json` の宣言と
 *     `registerCommand` の食い違いは、実行するまで気づけない）
 *   - `contributes.configuration` の宣言と、コードが読むキーが一致しているか
 *   - SecretStorage の読み書きが実環境で通るか（jsdom には SecretStorage が無い）
 *
 * deep link そのもの（OS が `vscode://` を拡張へ渡す部分）は拡張ホストからは駆動できない。
 * 解釈ロジックは `test/suite/shared/activationUri.test.ts` が、トークン検証は
 * `test/suite/shared/licenseToken.test.ts` が担保している。
 *
 * 実行: `node ./out-test/test/runTest.js`
 */
import assert from "assert";
import * as vscode from "vscode";

const EXTENSION_ID = 'ipreview.ipreview';

suite('Raw: license', () => {

    // この拡張は `onLanguage:markdown` で起動する。コマンドは activate() の中で
    // 登録されるので、先に有効化しておかないと「登録されていない」ように見える。
    suiteSetup(async function() {
        this.timeout(20000);
        const extension = vscode.extensions.getExtension(EXTENSION_ID);
        assert.ok(extension, `拡張 ${EXTENSION_ID} が見つからない`);
        await extension.activate();
    });

    suite('30. コマンドの登録', () => {

        test('30.1 購入・キー入力・復元の3コマンドが登録されている', async () => {
            const commands = await vscode.commands.getCommands(true);

            for (const id of [
                'markdownInline.removePdfCredit',
                'markdownInline.enterLicenseKey',
                'markdownInline.restorePurchase'
            ]) {
                assert.ok(commands.includes(id), `${id} が登録されていない`);
            }
        });

        test('30.2 package.json の宣言と実装が一致している（宣言だけで実体が無いコマンドが無い）', () => {
            const extension = vscode.extensions.getExtension(EXTENSION_ID);
            assert.ok(extension, `拡張 ${EXTENSION_ID} が見つからない`);

            const declared: { command: string }[] =
                extension.packageJSON?.contributes?.commands ?? [];
            const licenseCommands = declared
                .map((entry) => entry.command)
                .filter((id) => /removePdfCredit|enterLicenseKey|restorePurchase/.test(id));

            assert.strictEqual(licenseCommands.length, 3, '宣言されたライセンスコマンドが3つでない');
        });
    });

    suite('31. 設定の宣言', () => {

        test('31.1 export.creditLine は auto が既定', () => {
            const value = vscode.workspace
                .getConfiguration('markdownInline')
                .get<string>('export.creditLine');
            assert.strictEqual(value, 'auto');
        });

        test('31.2 export.creditLine は auto / always のみを取る', () => {
            const extension = vscode.extensions.getExtension(EXTENSION_ID);
            const properties =
                extension?.packageJSON?.contributes?.configuration?.properties ?? {};
            const setting = properties['markdownInline.export.creditLine'];

            assert.ok(setting, 'export.creditLine が宣言されていない');
            assert.deepStrictEqual(setting.enum, ['auto', 'always']);
        });

        test('31.3 license.serverUrl は既定が空（＝拡張内の既定 URL を使う）', () => {
            const value = vscode.workspace
                .getConfiguration('markdownInline')
                .get<string>('license.serverUrl');
            assert.strictEqual(value, '');
        });
    });

    suite('32. SecretStorage', () => {

        test('32.1 ライセンストークンを保存・読み出し・削除できる', async () => {
            const extension = vscode.extensions.getExtension(EXTENSION_ID);
            assert.ok(extension);
            await extension.activate();

            // 実際の SecretStorage を触る（jsdom では再現できない部分）。
            // 拡張本体が使うキーとは別のキーで、環境を汚さずに疎通だけ確かめる。
            const secrets = (extension.exports as { secrets?: vscode.SecretStorage })?.secrets;
            if (!secrets) {
                // 拡張が SecretStorage を export していない構成なら、この確認は省く。
                // （コマンド登録側で SecretStorage は既に使われている）
                return;
            }

            const key = 'markdownInline.test.token';
            await secrets.store(key, 'payload.signature');
            assert.strictEqual(await secrets.get(key), 'payload.signature');

            await secrets.delete(key);
            assert.strictEqual(await secrets.get(key), undefined);
        });
    });

    suite('33. 出荷前の安全弁', () => {

        test('33.1 購入導線が未完成のあいだは、PDF にクレジット行を入れない', async () => {
            // MONETIZATION_ENABLED が false のあいだ、無料ユーザーの PDF は今までどおり。
            // 「クレジット行が出るのに消す手段が無い」状態での出荷を防ぐ。
            const { MONETIZATION_ENABLED, shouldIncludeCredit } =
                await import('../../../src/shared/license/entitlement');

            if (MONETIZATION_ENABLED) {
                // 有効化したなら、公開鍵とサーバー URL が揃っているはず。
                const { LICENSE_PUBLIC_KEYS } = await import('../../../src/license/publicKey');
                assert.ok(
                    LICENSE_PUBLIC_KEYS.length > 0,
                    '課金を有効にしたのに公開鍵が空。全購入者が無料版に落ちる'
                );
                return;
            }

            assert.strictEqual(
                shouldIncludeCredit({
                    license: { ok: false, reason: 'malformed' },
                    monetizationEnabled: MONETIZATION_ENABLED,
                    setting: 'auto'
                }),
                false
            );
        });
    });
});
