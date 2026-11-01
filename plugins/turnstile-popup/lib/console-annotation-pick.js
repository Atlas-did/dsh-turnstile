/* Element pick runtime: hover outline, capture-phase click, Esc cancels. */
(function () {
  const P = window.TurnstileAnnotationPicker;
  if (!P) return;
  let overlay = null, onMove = null, onClick = null, onKey = null;

  function stop() {
    if (onMove) document.removeEventListener('pointermove', onMove, true);
    if (onClick) document.removeEventListener('click', onClick, true);
    if (onKey) document.removeEventListener('keydown', onKey, true);
    if (overlay) overlay.remove();
    overlay = null; onMove = null; onClick = null; onKey = null;
  }

  function paint(el) {
    if (!overlay) return;
    if (!el) { overlay.style.width = '0'; overlay.style.height = '0'; return; }
    const b = el.getBoundingClientRect();
    overlay.style.left = b.left + 'px';
    overlay.style.top = b.top + 'px';
    overlay.style.width = b.width + 'px';
    overlay.style.height = b.height + 'px';
  }

  function start(handlers = {}) {
    stop();
    overlay = document.createElement('div');
    overlay.setAttribute('data-annotation-ui', '1');
    overlay.setAttribute('data-testid', 'annotation-pick-overlay');
    overlay.style.cssText = 'position:fixed;pointer-events:none;z-index:75;border:2px solid #82c7ff;background:#82c7ff14;border-radius:4px;left:0;top:0;width:0;height:0';
    document.body.append(overlay);

    let hovered = null;
    onMove = (e) => {
      const el = P.pickableFrom(document.elementsFromPoint(e.clientX, e.clientY));
      if (el === hovered) return;
      hovered = el;
      paint(el);
      if (handlers.onHover) handlers.onHover(el && P.targetForElement(el));
    };
    onClick = (e) => {
      const el = P.pickableFrom(document.elementsFromPoint(e.clientX, e.clientY));
      e.preventDefault();
      e.stopPropagation();
      stop();
      if (!el) { if (handlers.onCancel) handlers.onCancel('未选中元素'); return; }
      if (handlers.onPick) handlers.onPick(P.targetForElement(el), el);
    };
    onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); stop(); if (handlers.onCancel) handlers.onCancel(''); }
    };
    document.addEventListener('pointermove', onMove, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey, true);
  }

  window.TurnstileAnnotationPick = { start, stop };
})();
