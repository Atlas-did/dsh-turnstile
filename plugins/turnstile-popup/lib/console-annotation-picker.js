/* Element picker: hover outline, capture-phase click, Esc to cancel, arrows to walk the tree. */
export const ANNOTATION_UI_ATTR = 'data-annotation-ui';

export function isAnnotationUi(el) {
  if (!el || typeof el.closest !== 'function') return false;
  return Boolean(el.closest('[' + ANNOTATION_UI_ATTR + ']'));
}

export function stableSelector(el) {
  if (!el || el.nodeType !== 1) return '';
  if (el.id) return '#' + String(el.id).replace(/[^\w-]/g, '\\$&');
  const testid = el.getAttribute && el.getAttribute('data-testid');
  if (testid) return '[data-testid="' + String(testid).replace(/"/g, '\\"') + '"]';
  const parts = [];
  let node = el;
  for (let i = 0; i < 4 && node && node.nodeType === 1; i++) {
    const tag = node.tagName.toLowerCase();
    const parent = node.parentElement;
    if (!parent) { parts.unshift(tag); break; }
    const same = Array.from(parent.children).filter((c) => c.tagName === node.tagName);
    parts.unshift(same.length > 1 ? tag + ':nth-of-type(' + (same.indexOf(node) + 1) + ')' : tag);
    if (typeof document !== 'undefined' && parent === document.body) break;
    node = parent;
  }
  return parts.join(' > ');
}

export function domPathOf(el) {
  if (!el || el.nodeType !== 1) return '';
  const parts = [];
  let node = el;
  const body = typeof document !== 'undefined' ? document.body : null;
  while (node && node.nodeType === 1 && node !== body && parts.length < 8) {
    const tag = node.tagName.toLowerCase();
    const parent = node.parentElement;
    if (!parent) break;
    const index = Array.from(parent.children).indexOf(node) + 1;
    parts.unshift(tag + ':nth-child(' + index + ')');
    node = parent;
  }
  return parts.length ? 'body > ' + parts.join(' > ') : '';
}

export function describeElement(el) {
  if (!el || el.nodeType !== 1) return { tag: '', text: '', rect: null };
  const box = el.getBoundingClientRect();
  return {
    tag: String(el.tagName || '').toLowerCase().slice(0, 40),
    text: String(el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120),
    rect: { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) },
  };
}

/** 从一组元素里挑第一个「可点选」的：不是批注 UI，也不是 html/body。 */
export function pickableFrom(list) {
  const rows = Array.isArray(list) ? list : [];
  for (const el of rows) {
    if (!el || el.nodeType !== 1) continue;
    const tag = String(el.tagName || '').toLowerCase();
    if (tag === 'html' || tag === 'body') continue;
    if (isAnnotationUi(el)) continue;
    return el;
  }
  return null;
}

export function targetForElement(el, extra = {}) {
  const info = describeElement(el);
  return Object.assign({
    selector: stableSelector(el),
    domPath: domPathOf(el),
    tag: info.tag,
    text: info.text,
    rect: info.rect,
  }, extra);
}

if (typeof window !== 'undefined') {
  window.TurnstileAnnotationPicker = { ANNOTATION_UI_ATTR, isAnnotationUi, stableSelector, domPathOf, describeElement, pickableFrom, targetForElement };
}
