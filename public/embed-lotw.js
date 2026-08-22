'use strict';
(()=>{
  const theme=document.createElement('script');theme.src='/assets/theme-pack.js';theme.async=true;document.head.append(theme);
  const el=document.getElementById('stats');
  if(!el)return;
  const query=new URLSearchParams(location.search);
  const filteredBand=String(query.get('band')||'all').toLowerCase()!=='all';
  const filteredDays=Math.max(0,Number(query.get('days'))||0)>0;
  // Per-QSO LoTW confirmation state is intentionally not public, so a client cannot
  // calculate a trustworthy LoTW aggregate for a visual band/date subset. In that
  // case the main globe renderer owns #stats and reports the exact filtered QSO count.
  if(filteredBand||filteredDays)return;
  let desired='';
  function label(data){if(data?.settings?.showStats===false)return '';const mode=data?.settings?.embedCount||'both',qso=Number(data?.qsoCount||0).toLocaleString(),lotw=Number(data?.lotwCount??data?.qsoCount??0).toLocaleString();if(mode==='qso')return `${qso} QSOs`;if(mode==='lotw')return `${lotw} LoTW confirmed`;return `${qso} QSOs · ${lotw} LoTW confirmed`}
  async function refresh(){try{const r=await fetch('/api/public',{cache:'no-store'});if(!r.ok)return;desired=label(await r.json());if(el.textContent!==desired)el.textContent=desired}catch{}}
  const observer=new MutationObserver(()=>{if(desired&&el.textContent!==desired)el.textContent=desired});observer.observe(el,{childList:true,characterData:true,subtree:true});refresh();setInterval(refresh,60000);
})();
