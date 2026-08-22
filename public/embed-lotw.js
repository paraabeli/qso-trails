'use strict';
(()=>{
  const theme=document.createElement('script');theme.src='/assets/theme-pack.js';theme.async=true;document.head.append(theme);
  const el=document.getElementById('stats');
  if(!el)return;
  const query=new URLSearchParams(location.search);
  const visuallyFiltered=String(query.get('band')||'all').toLowerCase()!=='all'||Math.max(0,Number(query.get('days'))||0)>0;
  let desired='';
  function label(data){if(data?.settings?.showStats===false)return '';const mode=data?.settings?.embedCount||'both',qso=Number(data?.qsoCount||0).toLocaleString(),lotw=Number(data?.lotwCount??data?.qsoCount??0).toLocaleString();if(mode==='qso')return `${qso} QSOs`;if(mode==='lotw')return `${lotw} LoTW confirmed`;return `${qso} QSOs · ${lotw} LoTW confirmed`}
  async function refresh(){
    try{
      const r=await fetch('/api/public',{cache:'no-store'});if(!r.ok)return;
      const data=await r.json();
      if(visuallyFiltered){
        const publicCount=Number(data?.qsoCount);
        dispatchEvent(new CustomEvent('qso-trails:public-settings',{detail:{settings:data?.settings||{},qsoCount:Number.isFinite(publicCount)&&publicCount>=0?publicCount:null}}));
        return;
      }
      desired=label(data);if(el.textContent!==desired)el.textContent=desired;
    }catch{}
  }
  let observer=null;
  if(!visuallyFiltered){observer=new MutationObserver(()=>{if(desired&&el.textContent!==desired)el.textContent=desired});observer.observe(el,{childList:true,characterData:true,subtree:true});}
  refresh();setInterval(refresh,60000);
})();
