/**
 * コードフェンス関連の純関数（`src/shared/markdown/codeFence.ts`）のユニットテスト。
 *
 * - `codeFenceMarker`: 内容を包める最短のフェンス（remark-stringify と同じ規則）
 * - `unwrapFencedBlock`: テキスト全体が単一の完結したフェンスブロックなら中身を取り出す
 * - `repairNestedCodeFences`: 二重フェンスになってしまった Markdown を修復する
 *
 * 二重フェンスは「コードブロックの中へフェンス付きテキストを貼り付ける」と発生し
 * （`code-fence-display-length-fix.md` / `nested-code-fence-repair.md`）、Preview では
 * フェンス行が4本並んで見え、コードブロック内の Cmd+A にもフェンスが混ざる
 * （2026-07-27 ユーザー報告）。貼り付け時の防止とは別に、既存ファイルを直す手段が要る。
 */
import * as assert from 'assert';
import {
    codeFenceMarker,
    unwrapFencedBlock,
    repairNestedCodeFences
} from '../../../src/shared/markdown/codeFence';

describe('codeFenceMarker', () => {
    it('バッククォートを含まない内容は3連バッククォート', () => {
        assert.strictEqual(codeFenceMarker('const a = 1;'), '```');
    });

    it('内容に3連バッククォートがあれば4連に広げる（remark-stringify と同じ規則）', () => {
        assert.strictEqual(codeFenceMarker('```\ncode\n```'), '````');
    });

    it('内容に4連バッククォートがあれば5連に広げる', () => {
        assert.strictEqual(codeFenceMarker('````\ncode\n````'), '`````');
    });

    it('インラインコード程度（1〜2連）では3連のまま', () => {
        assert.strictEqual(codeFenceMarker('`a` と ``b``'), '```');
    });
});

describe('unwrapFencedBlock', () => {
    it('単一の完結したフェンスブロックなら中身と言語を返す', () => {
        assert.deepStrictEqual(
            unwrapFencedBlock('```js\nconst a = 1;\n```'),
            { code: 'const a = 1;', language: 'js' }
        );
    });

    it('言語指定が無ければ language は空文字', () => {
        assert.deepStrictEqual(
            unwrapFencedBlock('```\nAnimate.\nSecond.\n```'),
            { code: 'Animate.\nSecond.', language: '' }
        );
    });

    it('前後の空行は無視する', () => {
        assert.deepStrictEqual(
            unwrapFencedBlock('\n\n```\ncode\n```\n\n'),
            { code: 'code', language: '' }
        );
    });

    it('フェンスで囲まれていないテキストは null', () => {
        assert.strictEqual(unwrapFencedBlock('plain text\nsecond line'), null);
    });

    it('閉じフェンスが無ければ null', () => {
        assert.strictEqual(unwrapFencedBlock('```\ncode'), null);
    });

    it('複数のフェンスブロックが並ぶテキストは null（外側だけ剥がすと壊れるため）', () => {
        assert.strictEqual(unwrapFencedBlock('```\na\n```\n\n```\nb\n```'), null);
    });

    it('チルダフェンス（~~~）にも対応する', () => {
        assert.deepStrictEqual(
            unwrapFencedBlock('~~~\ncode\n~~~'),
            { code: 'code', language: '' }
        );
    });
});

describe('repairNestedCodeFences', () => {
    it('二重フェンスのコードブロックを1重に戻す', () => {
        const broken = '前の段落\n\n````\n```\nAnimate the attached image.\n```\n````\n\n後の段落\n';
        const result = repairNestedCodeFences(broken);
        assert.strictEqual(result.fixed, 1);
        assert.strictEqual(
            result.markdown,
            '前の段落\n\n```\nAnimate the attached image.\n```\n\n後の段落\n'
        );
    });

    it('内側の言語指定を引き継ぐ', () => {
        const broken = '````\n```js\nconst a = 1;\n```\n````\n';
        const result = repairNestedCodeFences(broken);
        assert.strictEqual(result.markdown, '```js\nconst a = 1;\n```\n');
    });

    it('外側に言語がある場合は外側を優先する', () => {
        const broken = '````ts\n```\nconst a = 1;\n```\n````\n';
        const result = repairNestedCodeFences(broken);
        assert.strictEqual(result.markdown, '```ts\nconst a = 1;\n```\n');
    });

    it('三重フェンスも1重まで戻す', () => {
        const broken = '`````\n````\n```\ncode\n```\n````\n`````\n';
        const result = repairNestedCodeFences(broken);
        assert.strictEqual(result.markdown, '```\ncode\n```\n');
        assert.strictEqual(result.fixed, 2);
    });

    it('正常なコードブロックは1文字も変えない', () => {
        const ok = '# 見出し\n\n```js\nconst a = 1;\n```\n\n本文\n';
        const result = repairNestedCodeFences(ok);
        assert.strictEqual(result.fixed, 0);
        assert.strictEqual(result.markdown, ok);
    });

    it('中身が「フェンスを含む説明」である正当なブロックは壊さない（複数ブロックの例示）', () => {
        // 中身に2つのフェンスブロックが並ぶ＝単一ブロックの二重包みではないので触らない
        const doc = '````\n```\na\n```\n\n```\nb\n```\n````\n';
        const result = repairNestedCodeFences(doc);
        assert.strictEqual(result.fixed, 0);
        assert.strictEqual(result.markdown, doc);
    });

    it('複数の壊れたブロックをまとめて直す', () => {
        const broken = '````\n```\na\n```\n````\n\n段落\n\n````\n```\nb\n```\n````\n';
        const result = repairNestedCodeFences(broken);
        assert.strictEqual(result.fixed, 2);
        assert.strictEqual(result.markdown, '```\na\n```\n\n段落\n\n```\nb\n```\n');
    });
});
