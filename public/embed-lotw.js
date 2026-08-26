'use strict';
(()=>{
  const el=document.getElementById('stats');
  if(!el)return;
  const query=new URLSearchParams(location.search);
  const bandReplay=document.getElementById('bandReplay');
  const filteredDays=Math.max(0,Number(query.get('days'))||0);
  const requestedBand=String(query.get('band')||'all').trim().toLowerCase();
  let desired='',observer=null,bandTouched=false;
  function visuallyFiltered(){const selected=bandTouched?String(bandReplay?.value||'all').trim().toLowerCase():requestedBand;return selected!=='all'||filteredDays>0;}
  function label(data){if(data?.settings?.showStats===false)return '';const mode=data?.settings?.embedCount||'both',qso=Number(data?.qsoCount||0).toLocaleString(),lotw=Number(data?.lotwCount??data?.qsoCount??0).toLocaleString();if(mode==='qso')return `${qso} QSOs`;if(mode==='lotw')return `${lotw} LoTW confirmed`;return `${qso} QSOs · ${lotw} LoTW confirmed`;}
  function syncObserver(){
    if(visuallyFiltered()){
      if(observer){observer.disconnect();observer=null;}
      return;
    }
    if(observer)return;
    observer=new MutationObserver(()=>{if(!visuallyFiltered()&&desired&&el.textContent!==desired)el.textContent=desired});
    observer.observe(el,{childList:true,characterData:true,subtree:true});
  }
  async function refresh(){
    try{
      const r=await fetch('/api/public',{cache:'no-store'});if(!r.ok)return;
      const data=await r.json();
      if(visuallyFiltered()){
        const publicCount=Number(data?.qsoCount);
        dispatchEvent(new CustomEvent('qso-trails:public-settings',{detail:{settings:data?.settings||{},qsoCount:Number.isFinite(publicCount)&&publicCount>=0?publicCount:null}}));
        return;
      }
      desired=label(data);if(el.textContent!==desired)el.textContent=desired;
    }catch{}
  }
  function bandChanged(){bandTouched=true;desired='';syncObserver();refresh();}
  bandReplay?.addEventListener('change',bandChanged);
  syncObserver();refresh();setInterval(refresh,60000);
})();
