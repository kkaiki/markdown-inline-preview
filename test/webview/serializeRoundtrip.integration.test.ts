/**
 * Markdown 直列化 round-trip の統合テスト。
 *
 * Preview（Milkdown）で読み込んだ Markdown が、編集なしで直列化したときに
 * 構造・記法を保ったまま出力されることを検証する。特に:
 *  - 箇条書きマーカーが `-`（`*` ではない）で出力される（remarkStringifyOptionsCtx の bullet: '-'）
 *  - GFM チェックボックス `- [ ]` / `- [x]`
 *  - 強調・コード・取り消し線などのインライン記法
 *
 * milkdownApp.ts と同じ remarkStringifyOptionsCtx 設定を再現したエディタで検証する。
 */
import './jsdomSetup';
import * as assert from 'assert';
import {
    Editor, rootCtx, defaultValueCtx, editorViewCtx, serializerCtx, remarkStringifyOptionsCtx
} from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import type { EditorView } from '@milkdown/prose/view';
import type { Ctx } from '@milkdown/ctx';
import { normalizePreviewMarkdown } from '../../src/shared/markdown/lineBreaks';

interface RtHandle {
    view: EditorView;
    ctx: Ctx;
    serialize(): string;
    destroy(): void;
}

async function mkEditor(md: string): Promise<RtHandle> {
    const root = document.getElementById('root');
    if (!root) throw new Error('no root');
    root.innerHTML = '';
    const editor = await Editor.make()
        .config((ctx) => {
            ctx.set(rootCtx, root);
            ctx.set(defaultValueCtx, md);
            // milkdownApp.ts と同じ: 箇条書きマーカーを '-' に固定する
            ctx.update(remarkStringifyOptionsCtx, (prev) => ({ ...prev, bullet: '-' as const }));
        })
        .use(commonmark)
        .use(gfm)
        .create();
    let view!: EditorView;
    let ctx!: Ctx;
    editor.action((c) => { ctx = c; view = c.get(editorViewCtx); });
    return {
        view,
        ctx,
        serialize: () => {
            let md2 = '';
            editor.action((c) => { md2 = c.get(serializerCtx)(view.state.doc); });
            return md2;
        },
        destroy: () => void editor.destroy()
    };
}

describe('webview統合: Markdown 直列化 round-trip', () => {
    let h: RtHandle;
    afterEach(() => h?.destroy());

    // 実アプリの postChange と同じく、直列化結果を normalizePreviewMarkdown で
    // 整形してから比較する（リストの余分な空行除去・表セル改行変換などを再現）。
    async function roundtrip(md: string): Promise<string> {
        h = await mkEditor(md);
        return normalizePreviewMarkdown(h.serialize()).trimEnd();
    }

    it('見出し H1 が `# ` 形式で出力される', async () => {
        const out = await roundtrip('# Title\n');
        assert.strictEqual(out, '# Title');
    });

    it('見出し H3 が `### ` 形式で出力される', async () => {
        const out = await roundtrip('### Sub\n');
        assert.strictEqual(out, '### Sub');
    });

    it('箇条書きは `-` マーカーで出力される（`*` ではない）', async () => {
        const out = await roundtrip('- item\n');
        assert.strictEqual(out, '- item', `'-' で出力されていない: ${JSON.stringify(out)}`);
    });

    it('`* item`（アスタリスク）を読み込んでも `-` に正規化される', async () => {
        const out = await roundtrip('* item\n');
        assert.strictEqual(out, '- item', `'-' に正規化されていない: ${JSON.stringify(out)}`);
    });

    it('複数行の箇条書きがすべて `-` で出力される', async () => {
        const out = await roundtrip('- one\n- two\n- three\n');
        assert.deepStrictEqual(out.split('\n'), ['- one', '- two', '- three']);
    });

    it('番号付きリストは `1.` 形式で出力される', async () => {
        const out = await roundtrip('1. one\n2. two\n');
        assert.deepStrictEqual(out.split('\n'), ['1. one', '2. two']);
    });

    it('未チェックのタスク項目は `- [ ]` 形式で出力される', async () => {
        const out = await roundtrip('- [ ] todo\n');
        assert.ok(/^- \[ \] todo$/.test(out), `'- [ ] todo' で出力されていない: ${JSON.stringify(out)}`);
    });

    it('チェック済みのタスク項目は `- [x]` 形式で出力される', async () => {
        const out = await roundtrip('- [x] done\n');
        assert.ok(/^- \[x\] done$/.test(out), `'- [x] done' で出力されていない: ${JSON.stringify(out)}`);
    });

    it('太字 `**bold**` が保持される', async () => {
        const out = await roundtrip('**bold**\n');
        assert.strictEqual(out, '**bold**');
    });

    it('インラインコード `` `code` `` が保持される', async () => {
        const out = await roundtrip('`code`\n');
        assert.strictEqual(out, '`code`');
    });

    it('取り消し線 `~~strike~~` が保持される', async () => {
        const out = await roundtrip('~~strike~~\n');
        assert.ok(/~~strike~~/.test(out), `取り消し線が保持されていない: ${JSON.stringify(out)}`);
    });

    it('引用 `> quote` が保持される', async () => {
        const out = await roundtrip('> quote\n');
        assert.strictEqual(out, '> quote');
    });

    it('段落間の空行が保持される（2段落のまま）', async () => {
        const out = await roundtrip('para A\n\npara B\n');
        assert.deepStrictEqual(out.split('\n'), ['para A', '', 'para B']);
    });

    it('言語付きコードブロックが ```lang フェンスで出力される', async () => {
        const out = await roundtrip('```js\nconst a = 1;\n```\n');
        const lines = out.split('\n');
        assert.ok(lines[0].startsWith('```js'), `言語付きフェンスでない: ${JSON.stringify(out)}`);
        assert.ok(lines.includes('const a = 1;'), `コード内容が保持されていない: ${JSON.stringify(out)}`);
    });

    it('複合構造（見出し+リスト+引用）が round-trip で崩れない', async () => {
        const src = '# Heading\n\n- a\n- b\n\n> note\n';
        const out = await roundtrip(src);
        const lines = out.split('\n');
        assert.ok(lines.includes('# Heading'));
        assert.ok(lines.includes('- a'));
        assert.ok(lines.includes('- b'));
        assert.ok(lines.includes('> note'));
    });
});
