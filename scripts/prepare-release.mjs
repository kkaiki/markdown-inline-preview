#!/usr/bin/env node
/**
 * リリース準備スクリプト。
 *
 * package.json のバージョンを bump し、CHANGELOG.md の先頭に新バージョンの
 * 雛形セクションを挿入する。git の add/commit/tag/push は一切行わない —
 * CHANGELOG の中身（何が変わったか）は人間が書くべき内容であり、
 * commit/tag は「公開の引き金（タグ push → .github/workflows/publish.yml が
 * 発火）」なので、必ず内容を確認してから手動で行う。
 *
 * 使い方: node scripts/prepare-release.mjs <patch|minor|major|X.Y.Z>
 * 実行後の手順は標準出力に案内される。
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PKG_PATH = path.join(ROOT, 'package.json');
const CHANGELOG_PATH = path.join(ROOT, 'CHANGELOG.md');

function bumpVersion(current, kind) {
    if (/^\d+\.\d+\.\d+$/.test(kind)) {
        return kind;
    }
    const [major, minor, patch] = current.split('.').map(Number);
    switch (kind) {
        case 'major': return `${major + 1}.0.0`;
        case 'minor': return `${major}.${minor + 1}.0`;
        case 'patch': return `${major}.${minor}.${patch + 1}`;
        default:
            throw new Error(`不明な bump 種別: "${kind}"（patch / minor / major / X.Y.Z のいずれかを指定）`);
    }
}

function todayISO() {
    return new Date().toISOString().slice(0, 10);
}

function main() {
    const kind = process.argv[2];
    if (!kind) {
        console.error('使い方: node scripts/prepare-release.mjs <patch|minor|major|X.Y.Z>');
        process.exit(1);
    }

    const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
    const nextVersion = bumpVersion(pkg.version, kind);

    if (nextVersion === pkg.version) {
        console.error(`バージョンが変わりません（現在 ${pkg.version}）。中断します。`);
        process.exit(1);
    }

    pkg.version = nextVersion;
    fs.writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + '\n');

    const changelog = fs.readFileSync(CHANGELOG_PATH, 'utf8');
    const entry = `## ${nextVersion} - ${todayISO()}\n\n- \n\n`;
    fs.writeFileSync(CHANGELOG_PATH, entry + changelog);

    console.log(`package.json: ${pkg.version} に更新しました。`);
    console.log(`CHANGELOG.md 先頭に ${nextVersion} の雛形を挿入しました。`);
    console.log('');
    console.log('次の手順（このスクリプトは実行しません）:');
    console.log('  1. CHANGELOG.md の新セクションに変更内容を書く');
    console.log('  2. npm run docs:test-catalog（テストを追加・改名していれば）');
    console.log('  3. git add package.json CHANGELOG.md && git commit -m "chore: release v' + nextVersion + '"');
    console.log(`  4. git tag v${nextVersion}`);
    console.log(`  5. git push && git push origin v${nextVersion}`);
    console.log('     → タグ push で .github/workflows/publish.yml が発火し、');
    console.log('       test → vsce/ovsx publish → GitHub Release 作成まで自動実行される。');
}

main();
