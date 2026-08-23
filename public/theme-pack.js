'use strict';
(()=>{
  const requested=String(new URLSearchParams(location.search).get('theme')||'night').toLowerCase();
  document.documentElement.dataset.qsoTheme=requested;
  const style=document.createElement('style');
  style.textContent=`html[data-qso-theme="midnight"] #c{filter:saturate(1.35) brightness(.72) contrast(1.18)}html[data-qso-theme="aurora"] #c{filter:hue-rotate(32deg) saturate(1.55) brightness(.92)}html[data-qso-theme="amber"] #c{filter:sepia(.78) saturate(1.35) hue-rotate(345deg) contrast(1.08)}html[data-qso-theme="mono"] #c{filter:grayscale(1) contrast(1.18)}html[data-qso-theme="ice"] #c{filter:saturate(.75) hue-rotate(8deg) brightness(1.08)}html[data-qso-theme="earth"] #wrap{background:#02050a}`;
  document.head.append(style);
})();
