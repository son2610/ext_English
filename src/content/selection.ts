import type { Source } from '../domain/models';

function surrounding(root: Node, boundary: Node, offset: number, backwards: boolean): string {
  const limit = 1500;
  const filter = { acceptNode: (n: Node) => n.parentElement?.closest('script,style,noscript,input,textarea,[contenteditable],[data-mach-doc]') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT };
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, filter);
  let value = ''; let node: Node | null = null;
  if (boundary.nodeType === Node.TEXT_NODE) {
    const text = boundary.textContent ?? '';
    value = backwards ? text.slice(Math.max(0, offset - limit), offset) : text.slice(offset, offset + limit);
    walker.currentNode = boundary;
    node = backwards ? walker.previousNode() : walker.nextNode();
  } else {
    const child = boundary.childNodes[backwards ? offset - 1 : offset];
    walker.currentNode = child ?? boundary;
    if (child?.nodeType === Node.TEXT_NODE) node = child;
    else if (child) node = backwards ? walker.lastChild() ?? walker.previousNode() : walker.firstChild() ?? walker.nextNode();
    else if (backwards) node = walker.previousNode();
    else { walker.lastChild(); node = walker.nextNode(); }
  }
  let count = 0;
  while (node && value.length < limit && count++ < 100) {
    const text = node.textContent ?? '';
    const remaining = limit - value.length;
    value = backwards ? text.slice(-remaining) + value : value + text.slice(0, remaining);
    node = backwards ? walker.previousNode() : walker.nextNode();
  }
  return value;
}
export function selectedSource(): { source: Source; rect: DOMRect } | undefined {
  const selection = window.getSelection();
  if (!selection?.rangeCount || selection.isCollapsed) return;
  const range = selection.getRangeAt(0).cloneRange();
  const element = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer as Element : range.startContainer.parentElement;
  if (!element || element.closest('input,textarea,[contenteditable="true"],[role="textbox"]')) return;
  const exact = selection.toString().trim();
  if (!exact || exact.length > 8000 || !/[a-zA-Z]/.test(exact)) return;
  const common = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE ? range.commonAncestorContainer as Element : range.commonAncestorContainer.parentElement;
  const block = element.closest('p,li,blockquote,pre,td,section,article') ?? element;
  const contextRoot = common?.closest('article,main') ?? document.body ?? document.documentElement;
  // Walk from the actual endpoints, not from the beginning of a potentially huge article.
  const before = surrounding(contextRoot, range.startContainer, range.startOffset, true);
  const after = surrounding(contextRoot, range.endContainer, range.endOffset, false);
  const context = `${before}\n${exact}\n${after}`.trim();
  const prefix = before.slice(-150);
  const suffix = after.slice(0, 150);
  const rects = range.getClientRects();
  const rect = Array.from(rects).find(r => r.width > 0 && r.bottom >= 0 && r.top <= innerHeight && r.right >= 0 && r.left <= innerWidth);
  if (!rect) return;
  let url = location.href;
  if (!/^https?:/.test(url)) url = document.referrer;
  if (!/^https?:/.test(url)) return;
  let heading = '';
  let cursor: Element | null = block ?? null;
  for (let i = 0; cursor && i < 12; i++, cursor = cursor.previousElementSibling ?? cursor.parentElement) {
    if (/^H[1-6]$/.test(cursor.tagName)) { heading = (cursor.textContent ?? '').slice(0, 500); break; }
  }
  return { rect, source: { url, frameUrl: url, title: document.title, exact, context: context.slice(0, 14000), prefix, suffix, heading, scrollY: Math.max(0, scrollY), capturedAt: Date.now() } };
}
