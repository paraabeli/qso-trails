'use strict';
(()=>{
  // Presentation-only embed layout selector. Mirrors theme-pack.js: it sets a
  // data attribute on <html> and lets the external stylesheet do all the work,
  // so it stays compatible with the strict embed CSP (no inline styles/scripts).
  // The layout only rearranges existing public HUD elements; it never changes
  // which QSO fields are public.
  const allowed=new Set(['classic','chrome','poster','instrument']);
  const requested=String(new URLSearchParams(location.search).get('layout')||'classic').toLowerCase();
  document.documentElement.dataset.qsoLayout=allowed.has(requested)?requested:'classic';
})();