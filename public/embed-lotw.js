'use strict';
(()=>{
  const theme=document.createElement('script');theme.src='/assets/theme-pack.js';theme.async=true;document.head.append(theme);
  const el=document.getElementById('stats');
  if(!el)return;
  let desired='';
  function label(data){if(data?.settings?.showStats===false)return '';const mode=data?.settings?.embedCount||'both',qso=Number(data?.qsoCount||0).toLocaleString(),lotw=Number(data?.lotwCount??data?.qsoCount??0).toLocaleString();if(mode==='qso')return `${qso} QSOs`;if(mode==='lotw')return `${lotw} LoTW confirmed`;return `${qso} QSOs · ${lotw} LoTW confirmed`}
  async function refresh(){try{const r=await fetch('/api/public',{cache:'no-store'});if(!r.ok)return;desired=label(await r.json());if(el.textContent!==desired)el.textContent=desired}catch{}}
  const observer=new MutationObserver(()=>{if(desired&&el.textContent!==desired)el.textContent=desired});observer.observe(el,{childList:true,characterData:true,subtree:true});refresh();setInterval(refresh,60000);
})();
