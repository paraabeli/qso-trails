'use strict';
(()=>{
  const extra=new Set(['midnight','aurora','amber','mono','ice','earth']);
  const addOptions=(select,items)=>{if(!select)return;const existing=new Set([...select.options].map(o=>o.value));for(const [value,label] of items){if(existing.has(value))continue;select.append(new Option(label,value));}};
  const themes=[['midnight','Midnight'],['aurora','Aurora'],['amber','Amber'],['mono','Monochrome'],['ice','Ice'],['earth','Real Earth · NASA Blue Marble']];
  function forceStaticTheme(){
    const s=document.getElementById('staticTheme');if(!s||!extra.has(s.value))return;
    const theme=s.value;
    queueMicrotask(()=>{
      const preview=document.getElementById('staticPreview');
      if(preview){const u=new URL(preview.src,location.origin);u.searchParams.set('theme',theme);preview.src=u.pathname+u.search}
      const snippet=document.getElementById('staticSnippet');
      if(snippet){snippet.textContent=snippet.textContent.replace(/([?&]theme=)[^&\s<]+/g,`$1${theme}`).replace(/(\/static\/qrz\.png)(?![^\s<]*[?&]theme=)/g,`$1?theme=${theme}`)}
    });
  }
  function apply(){
    addOptions(document.getElementById('visualTheme'),themes);
    const s=document.getElementById('staticTheme');addOptions(s,themes);
    if(s&&!s.dataset.themePack){
      s.dataset.themePack='1';s.addEventListener('change',forceStaticTheme);
      const note=document.createElement('small');note.textContent='Real Earth uses a locally cached NASA Blue Marble texture. No visitor browser contacts NASA.';s.closest('label')?.after(note);
    }
  }
  apply();
  new MutationObserver(apply).observe(document.body,{childList:true,subtree:true});
})();
