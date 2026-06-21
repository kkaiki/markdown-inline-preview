/**
 * Milkdown / ProseMirror を Node 上で動かすための jsdom グローバル設定。
 * このモジュールを（Milkdown を読み込むより前に）import するだけで副作用として
 * 必要な window / document などのグローバルを用意する。
 *
 * 注意: このディレクトリ（test/webview）は tsc ではコンパイルせず、esbuild で
 * バンドルしてから mocha で実行する（@milkdown/* が ESM-only export のため）。
 */
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost/',
    pretendToBeVisual: true
});

const g = globalThis as unknown as Record<string, unknown>;
const w = dom.window as unknown as Record<string, unknown>;

g.window = dom.window;
g.document = dom.window.document;
g.navigator = dom.window.navigator;
g.HTMLElement = dom.window.HTMLElement;
g.customElements = dom.window.customElements;
g.Node = dom.window.Node;
g.DOMParser = dom.window.DOMParser;
g.getComputedStyle = dom.window.getComputedStyle;
g.MutationObserver = dom.window.MutationObserver;
g.Event = dom.window.Event;
g.CustomEvent = dom.window.CustomEvent;
g.KeyboardEvent = dom.window.KeyboardEvent;
g.DOMException = dom.window.DOMException;

if (!w.matchMedia) {
    w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
}
g.matchMedia = w.matchMedia;

class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
}
g.ResizeObserver = ResizeObserverStub;
w.ResizeObserver = ResizeObserverStub;

g.addEventListener = dom.window.addEventListener.bind(dom.window);
g.removeEventListener = dom.window.removeEventListener.bind(dom.window);
g.dispatchEvent = dom.window.dispatchEvent.bind(dom.window);
g.requestAnimationFrame = (cb: (t: number) => void) => dom.window.setTimeout(() => cb(Date.now()), 0);
g.cancelAnimationFrame = (id: number) => dom.window.clearTimeout(id);

export { dom };
