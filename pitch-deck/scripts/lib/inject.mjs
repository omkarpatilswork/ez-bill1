// The only two things we change on ezbill.live before a capture:
//   1. hide the "Edit with Lovable" badge
//   2. change the visible text "EZZ BILLZ" to "EZZ BILL"
// Nothing else in the page is touched. Privacy blurs are NOT done here: they
// are applied to the saved image afterwards (see privacy.mjs), so the app's
// DOM stays exactly as the app rendered it.

export const INIT_SCRIPT = `(() => {
  if (window.__ezbInjected) return; window.__ezbInjected = true;
  const FROM = 'EZZ BILLZ', TO = 'EZZ BILL';
  const css = '#lovable-badge,[id^="lovable-badge"]{display:none!important}';
  const addCss = () => {
    if (document.getElementById('__ezb_css')) return;
    const s = document.createElement('style'); s.id = '__ezb_css'; s.textContent = css;
    (document.head || document.documentElement).appendChild(s);
  };
  const hideBadge = () => {
    // Text-based fallback in case the badge id changes: hide the fixed-position
    // element that holds "Edit with Lovable".
    for (const a of document.querySelectorAll('a[href*="lovable.dev"], a[href*="lovable.app"], [id*="lovable"]')) {
      let el = a, fixed = null;
      for (let i = 0; el && i < 4; i++, el = el.parentElement) {
        if (getComputedStyle(el).position === 'fixed') { fixed = el; break; }
      }
      if (fixed && /edit with|lovable/i.test(fixed.textContent || fixed.innerHTML)) fixed.style.setProperty('display', 'none', 'important');
    }
  };
  const rename = (root) => {
    if (!root) return;
    if (root.nodeType === 3) { if (root.nodeValue.includes(FROM)) root.nodeValue = root.nodeValue.split(FROM).join(TO); return; }
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n; while ((n = w.nextNode())) if (n.nodeValue.includes(FROM)) n.nodeValue = n.nodeValue.split(FROM).join(TO);
  };
  const run = () => { addCss(); hideBadge(); rename(document.body); };
  const start = () => {
    run();
    new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === 'characterData') rename(m.target);
        else m.addedNodes.forEach(rename);
      }
      hideBadge();
    }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();`;
