'use strict';
(()=>{
  const requested=String(new URLSearchParams(location.search).get('theme')||'night').toLowerCase();
  document.documentElement.dataset.qsoTheme=requested;
})();
