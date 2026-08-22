'use strict';
(()=>{
  const theme=document.createElement('script');theme.src='/assets/admin-theme-pack.js';theme.async=true;document.head.append(theme);
  const $=id=>document.getElementById(id),name=$('name');if(!name)return;
  const label=document.createElement('label');label.className='inline';const toggle=document.createElement('input');toggle.type='checkbox';toggle.id='publishStationName';label.append(toggle,document.createTextNode(' Publish station / callsign label publicly'));const note=document.createElement('small');note.textContent='Off by default. The private station label remains available in Admin but is omitted from public JSON, embed, and static image unless enabled.';name.closest('label')?.after(label,note);
  const originalFetch=window.fetch.bind(window);window.fetch=async function privacyFetch(resource,init={}){const url=typeof resource==='string'?resource:resource?.url||'';if(url==='/api/admin/settings'&&String(init.method||'GET').toUpperCase()==='POST'&&typeof init.body==='string'){try{const body=JSON.parse(init.body);body.publishStationName=toggle.checked===true;init={...init,body:JSON.stringify(body)}}catch{}}return originalFetch(resource,init)};
  originalFetch('/api/admin/state',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(state=>{toggle.checked=state?.settings?.publishStationName===true}).catch(()=>{});
})();
