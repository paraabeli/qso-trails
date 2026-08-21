'use strict';
(()=>{
  const $=id=>document.getElementById(id);
  const stats=$('stats');
  if(!stats)return;

  const filterLabel=document.createElement('label');
  filterLabel.textContent='QSO map filter';
  const filter=document.createElement('select');
  filter.id='lotwFilter';
  filter.innerHTML='<option value="all">Show all selected QSOs</option><option value="confirmed">Show only LoTW-confirmed QSOs</option>';
  filterLabel.append(filter);

  const countLabel=document.createElement('label');
  countLabel.textContent='Embed count display';
  const count=document.createElement('select');
  count.id='embedCount';
  count.innerHTML='<option value="qso">QSO count only</option><option value="lotw">LoTW confirmed count only</option><option value="both">QSO + LoTW confirmed counts</option>';
  countLabel.append(count);

  const note=document.createElement('small');
  note.id='lotwNote';
  note.textContent='LoTW status is fetched from Wavelog API v2. The token needs qso:read and confirmation:read.';
  stats.closest('label')?.after(filterLabel,countLabel,note);

  const syncStatus=document.createElement('small');
  syncStatus.id='lotwSyncStatus';
  $('wlstatus')?.after(syncStatus);

  const originalFetch=window.fetch.bind(window);
  window.fetch=async(input,init)=>{
    let url='';
    try{
      url=typeof input==='string'?input:input?.url||String(input);
      if(url.includes('/api/admin/settings')&&init?.method==='POST'&&typeof init.body==='string'){
        const body=JSON.parse(init.body);
        body.lotwFilter=filter.value;
        body.embedCount=count.value;
        init={...init,body:JSON.stringify(body)};
      }
    }catch{}
    const response=await originalFetch(input,init);
    if(response.ok&&(url.includes('/api/admin/settings')||url.includes('/api/admin/wavelog/sync')))setTimeout(refresh,50);
    return response;
  };

  function renderState(s){
    const settings=s?.settings||{},w=s?.wavelog||{},e=s?.publicExposure||{};
    filter.value=settings.lotwFilter==='confirmed'?'confirmed':'all';
    count.value=['qso','lotw','both'].includes(settings.embedCount)?settings.embedCount:'both';
    const parts=[];
    if(w.lotwConfirmationSyncAt)parts.push(`LoTW confirmations last synced ${w.lotwConfirmationSyncAt}`);
    else parts.push('LoTW confirmations have not been synced yet');
    if(Number.isFinite(Number(e.lotwCount)))parts.push(`${Number(e.lotwCount).toLocaleString()} confirmed in the current band/mode selection`);
    if(w.lotwConfirmationError)parts.push(`warning: ${w.lotwConfirmationError}`);
    syncStatus.textContent=parts.join(' · ')+'.';
    const exposure=$('exposure');
    if(exposure){
      const base=exposure.textContent.split('\n\nLoTW publishing:')[0];
      exposure.textContent=`${base}\n\nLoTW publishing:\nFilter: ${filter.value==='confirmed'?'LoTW-confirmed QSOs only':'all selected QSOs'}\nLoTW confirmed in selected set: ${Number(e.lotwCount||0).toLocaleString()}\nAll selected before LoTW filter: ${Number(e.allQsoCount||0).toLocaleString()}\nEmbed count display: ${count.options[count.selectedIndex]?.textContent||count.value}`;
    }
  }
  async function refresh(){
    try{const r=await originalFetch('/api/admin/state',{cache:'no-store'});if(r.ok)renderState(await r.json());}catch{}
  }
  refresh();
})();
