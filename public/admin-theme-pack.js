'use strict';
(()=>{
  const addOptions=(select,items)=>{if(!select)return;const existing=new Set([...select.options].map(o=>o.value));for(const [value,label] of items){if(existing.has(value))continue;select.append(new Option(label,value));}};
  const embedThemes=[['midnight','Midnight'],['aurora','Aurora'],['amber','Amber'],['mono','Monochrome'],['ice','Ice'],['earth','Real Earth · NASA Blue Marble']];
  const staticThemes=[['midnight','Midnight'],['aurora','Aurora'],['amber','Amber'],['mono','Monochrome'],['ice','Ice'],['earth','Real Earth · NASA Blue Marble']];
  function apply(){
    addOptions(document.getElementById('visualTheme'),embedThemes);
    addOptions(document.getElementById('staticTheme'),staticThemes);
    const s=document.getElementById('staticTheme');
    if(s&&!s.dataset.earthNote){s.dataset.earthNote='1';const note=document.createElement('small');note.textContent='Real Earth uses a locally cached NASA Blue Marble texture. No visitor browser contacts NASA.';s.closest('label')?.after(note)}
  }
  apply();
  new MutationObserver(apply).observe(document.body,{childList:true,subtree:true});
})();
