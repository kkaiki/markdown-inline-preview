import * as vscode from 'vscode';

/**
 * PRO+ の案内（ステータスバー・ツールバーのバッジ・更新通知のボタン・PDF 書き出し前の確認）を出すか。
 * 設定 `markdownInline.showProPromotions`（既定 true）。PDF のクレジット行の有無には関係しない。
 */
export function proPromotionsEnabled(): boolean {
    return vscode.workspace.getConfiguration('markdownInline').get<boolean>('showProPromotions', true);
}
