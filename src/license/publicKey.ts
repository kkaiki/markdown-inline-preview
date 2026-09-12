/**
 * ライセンストークンの検証に使う Ed25519 公開鍵。
 *
 * 対応する秘密鍵はライセンスサーバー（`ipreview-license`）の Secret Manager にのみ存在する。
 * ここに置いてあるのは公開鍵なので、リポジトリが公開されていて問題ない。
 *
 * **配列なのは鍵ローテーションのため。** 鍵を替えるときは新しい鍵を先頭に足し、
 * 古い鍵はトークンの寿命（30 日）が過ぎてから消す。先に消すと、まだ古い鍵で署名された
 * トークンを持っている購入者が無料版に戻ってしまう。
 *
 * 鍵の生成はサーバー側の `pnpm keygen`。
 */

export const LICENSE_PUBLIC_KEYS: string[] = [
    // 本番鍵 v1（2026-08-13 生成）。
    // 対応する秘密鍵は GCP プロジェクト `ipreview-license` の
    // Secret Manager `license-signing-key` にのみ存在する。
    '-----BEGIN PUBLIC KEY-----\n' +
        'MCowBQYDK2VwAyEA0n5oZBYVQdMYdoduskLxWqohBK3YrO21W5NEqw2zdok=\n' +
        '-----END PUBLIC KEY-----\n'
];
