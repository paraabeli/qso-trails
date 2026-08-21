'use strict';
(()=>{
  const $=id=>document.getElementById(id);
  const name=$('name');
  if(!name)return;

  const label=document.createElement('label');
  label.className='inline';
  const input=document.createElement('input');
  input.type='checkbox';
  input.id='publishStationName';
  label.append(input,document.createTextNode(' Publish station / callsign label publicly'));
  const note=document.createElement('small');
  note.textContent='Off by default. The private station label remains available in Admin but is omitted from the public JSON, embed, and static image.';
  name.closest('label')?.after(label,note);

  const originalFetch=window.fetch.bind(window);
  window.fetch=async function privacyFetch(input,init={}){
    const url=typeof input==='string'?input:input?.url||'';
    if(url==='/api/admin/settings'&&String(init.method||'GET').toUpperCase()==='POST'&&typeof init.body==='string'){
      try{
        const body=JSON.parse(init.body);
        body.publishStationName=input?.checked===true;
        init={...init,body:JSON.stringify(body)};
      }catch{}
    }
    const response=await originalFetch(input,init);
    if(url==='/api/admin/state'&&response.ok){
      try{
        const clone=response.clone();
        const state=await clone.json();
        queueMicrotask(()=>{input.checked=state?.settings?.publishStationName===true;});
      }catch{}
    }
    return response;
  };
})();
