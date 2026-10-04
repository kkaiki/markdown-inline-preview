/**
 * セルの範囲を選んでいるあいだ、ブラウザ側にも「コピーできる選択」を持たせる。
 *
 * 範囲はクラスで自前に描いているだけなので、ブラウザの選択は空のままになる。
 * 実 VS Code / Cursor の ⌘C はメニュー経由（`webContents.copy()`）で届くため、選択が空だと
 * コピーのコマンド自体が無効になり、copy イベントが来ない（何もコピーされない）。
 * そこで、フォーカス中（なければ選択したうちの文字のある）セルの中身を選んでおく。
 * 見た目は CSS で透明にする（範囲の色と二重に見えないように）。コピーの中身は copy イベントが決める。
 */
export function keepCopyableSelection(wrap: HTMLElement): void {
    const sel = window.getSelection();
    if (!sel) return;
    const active = document.activeElement as HTMLElement | null;
    const candidates = [
        ...(active && wrap.contains(active) && active.contentEditable === 'true' ? [active] : []),
        ...wrap.querySelectorAll<HTMLElement>('.cm-live-cell-selected')
    ];
    const host = candidates.find((el) => (el.textContent ?? '') !== '');
    if (!host) return;
    const range = document.createRange();
    range.selectNodeContents(host);
    sel.removeAllRanges();
    sel.addRange(range);
}
