import { AhoCorasick, type Match, type Pattern } from './matcher';
import { send } from '../shared/client';

type HighlightSet = { add(range: Range): void; delete(range: Range): void; clear(): void };
type HighlightWindow = Window & { Highlight: new () => HighlightSet };
export function startHighlights(patterns: Pattern[]): () => void {
  const registry = (CSS as unknown as { highlights?: Map<string, HighlightSet> }).highlights;
  if (!registry || !('Highlight' in window) || !patterns.length) return () => undefined;
  const matcher = new AhoCorasick(patterns);
  const highlights = new (window as HighlightWindow).Highlight();
  registry.set('mach-doc-known', highlights);
  const style = document.createElement('style');
  style.textContent = '::highlight(mach-doc-known){background-color:rgba(127,164,97,.19);text-decoration:underline;text-decoration-color:#80966b}';
  document.documentElement.append(style);
  const tooltip = document.createElement('div'); tooltip.popover = 'manual';
  tooltip.style.cssText = 'all:initial!important;position:fixed!important;inset:auto!important;margin:0!important;border:0!important;padding:0!important;max-width:280px!important;';
  const shadow = tooltip.attachShadow({ mode: 'closed' });
  const label = document.createElement('div');
  label.style.cssText = 'font:14px/1.6 system-ui;color:#fff;background:#254a40;padding:10px 14px;border-radius:10px;box-shadow:0 6px 24px #0002;white-space:pre-wrap;max-height:min(240px,calc(100vh - 16px));overflow:auto;';
  shadow.append(label); document.documentElement.append(tooltip);
  let stopped = false; let rangeCount = 0; let visited = 0; let idle = 0; let timer = 0;
  let pageUrl = location.href;
  const pending = new Set<Element>();
  const records = new Map<Text, { range: Range; match: Match }[]>();
  const elements = new Map<Element, Set<Text>>();
  const visible = new Set<Element>();
  const encounters = new Set<string>(); const sent = new Set<string>();
  function clearElement(element: Element) {
    for (const node of elements.get(element) ?? []) {
      for (const item of records.get(node) ?? []) { highlights.delete(item.range); rangeCount--; }
      records.delete(node);
    }
    elements.delete(element);
  }
  function flushEncounters() {
    timer = 0;
    if (!encounters.size || stopped) return;
    const ids = [...encounters].slice(0, 100); ids.forEach(id => encounters.delete(id));
    void send({ type: 'encounter', unitIds: ids }).catch(() => undefined);
    if (encounters.size) timer = window.setTimeout(flushEncounters, 2000);
  }
  const intersection = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.target.isConnected) { clearElement(entry.target); visible.delete(entry.target); intersection.unobserve(entry.target); continue; }
      if (entry.isIntersecting) visible.add(entry.target); else visible.delete(entry.target);
      clearElement(entry.target);
      if (!entry.isIntersecting || stopped || rangeCount >= 500 || document.hidden) continue;
      if (entry.target.closest('script,style,pre,code,input,textarea,select,[contenteditable],[role="textbox"],[hidden]')) continue;
      const nodeSet = new Set<Text>();
      for (const node of entry.target.childNodes) {
        if (node.nodeType !== Node.TEXT_NODE || !node.textContent || node.textContent.length > 4096) continue;
        const textNode = node as Text;
        const matches = matcher.search(textNode.data).slice(0, Math.max(0, 500 - rangeCount));
        const items = matches.map(match => {
          const range = new Range(); range.setStart(textNode, match.start); range.setEnd(textNode, match.end);
          highlights.add(range); rangeCount++;
          if (!sent.has(match.pattern.id)) { sent.add(match.pattern.id); encounters.add(match.pattern.id); }
          return { range, match };
        });
        if (items.length) { records.set(textNode, items); nodeSet.add(textNode); }
      }
      if (nodeSet.size) elements.set(entry.target, nodeSet);
    }
    if (encounters.size && !timer) timer = window.setTimeout(flushEncounters, 2000);
  }, { threshold: 0.1 });
  let walker: TreeWalker | undefined;
  function schedule() { if (!idle && !stopped) idle = requestIdleCallback(work, { timeout: 1500 }); }
  function work(deadline: IdleDeadline) {
    idle = 0; const start = performance.now();
    while (!stopped && performance.now() - start < 4 && (deadline.timeRemaining() > 1 || deadline.didTimeout)) {
      if (!walker) {
        const root = pending.values().next().value as Element | undefined;
        if (!root) break;
        pending.delete(root);
        if (!root.isConnected) continue;
        intersection.observe(root);
        walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
      }
      const node = walker.nextNode() as Element | null;
      if (!node || visited++ > 20000) { walker = undefined; if (visited > 20000) pending.clear(); continue; }
      if (node.childNodes.length && !node.closest('[data-mach-doc],script,style,pre,code,input,textarea,select,[contenteditable]')) intersection.observe(node);
    }
    for (const element of elements.keys()) if (!element.isConnected) { clearElement(element); visible.delete(element); intersection.unobserve(element); }
    if (pending.size || walker) schedule();
  }
  function add(root: Element) { if (pending.size < 100 && !root.closest('[data-mach-doc]')) { pending.add(root); schedule(); } }
  add(document.body ?? document.documentElement);
  const observer = new MutationObserver(mutations => {
    if (location.href !== pageUrl) { pageUrl = location.href; sent.clear(); visited = 0; }
    for (const mutation of mutations.slice(0, 100)) {
      if (mutation.target instanceof Element && mutation.target.closest('[data-mach-doc]')) continue;
      const parent = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
      if (parent) { clearElement(parent); intersection.unobserve(parent); intersection.observe(parent); }
      for (const node of Array.from(mutation.addedNodes).slice(0, 30)) if (node instanceof Element) add(node);
    }
  });
  observer.observe(document.body ?? document.documentElement, { childList: true, subtree: true, characterData: true });
  let lastMove = 0;
  function hover(event: MouseEvent) {
    if (performance.now() - lastMove < 80) return;
    lastMove = performance.now();
    const caret = (document as Document & { caretRangeFromPoint(x: number, y: number): Range | null }).caretRangeFromPoint(event.clientX, event.clientY);
    const found = caret ? records.get(caret.startContainer as Text)?.find(item => item.match.start <= caret.startOffset && item.match.end > caret.startOffset) : undefined;
    if (!found) { if (tooltip.matches(':popover-open')) tooltip.hidePopover(); return; }
    label.textContent = `${found.match.pattern.text}\n${found.match.pattern.meaning}`;
    tooltip.style.setProperty('left', `${Math.max(8, Math.min(innerWidth - 290, event.clientX + 10))}px`, 'important');
    tooltip.style.setProperty('top', `${Math.max(8, Math.min(innerHeight - 260, event.clientY + 18))}px`, 'important');
    if (!tooltip.matches(':popover-open')) tooltip.showPopover();
  }
  tooltip.dataset.machDoc = 'tooltip';
  document.addEventListener('mousemove', hover, { passive: true });
  const resume = () => { if (!document.hidden) for (const element of visible) { intersection.unobserve(element); if (element.isConnected) intersection.observe(element); else visible.delete(element); } };
  document.addEventListener('visibilitychange', resume);
  return () => { stopped = true; observer.disconnect(); intersection.disconnect(); cancelIdleCallback(idle); clearTimeout(timer); registry.delete('mach-doc-known'); records.clear(); elements.clear(); visible.clear(); style.remove(); tooltip.remove(); document.removeEventListener('mousemove', hover); document.removeEventListener('visibilitychange', resume); };
}
