'use strict';
(()=>{
  const $=id=>document.getElementById(id);
  const expandedThemes=[['midnight','Midnight'],['aurora','Aurora'],['amber','Amber'],['mono','Monochrome'],['ice','Ice'],['earth','Real Earth · NASA Blue Marble']];
  const staticThemes=new Set(['retro','clean','futuristic','rough',...expandedThemes.map(([value])=>value)]);
  const addThemeOptions=select=>{if(!select)return;const existing=new Set([...select.options].map(option=>option.value));for(const[value,label]of expandedThemes)if(!existing.has(value))select.append(new Option(label,value));};
  const makeToggle=(id,label,checked=true)=>{const el=document.createElement('label');el.className='inline';const input=document.createElement('input');input.type='checkbox';input.id=id;input.checked=checked;el.append(input,document.createTextNode(` ${label}`));return el;};
  const makeHeading=text=>{const h=document.createElement('h4');h.textContent=text;h.style.marginBottom='6px';return h;};

  addThemeOptions($('visualTheme'));

  const iframePre=$('iframe');
  if(iframePre){
    const box=document.createElement('div');
    box.id='embedTextControls';
    box.append(makeHeading('Embed visible text'),makeToggle('embedShowName','Station label'),makeToggle('embedShowStats','QSO count'),makeToggle('embedShowLegend','Band legend'),makeToggle('embedShowDxcc','DXCC summary'),makeToggle('embedShowDetails','Click/help text'));
    const note=document.createElement('small');note.textContent='These options only hide or show presentation text. They do not make additional QSO fields public.';box.append(note);
    iframePre.before(box);
  }

  const staticPreview=$('staticPreview');
  if(staticPreview){
    const box=document.createElement('div');box.id='staticPublishControls';
    const projectionLabel=document.createElement('label');projectionLabel.textContent='Projection';
    const projection=document.createElement('select');projection.id='staticProjection';projection.replaceChildren(new Option('3D globe','globe'),new Option('Mercator map','mercator'));projectionLabel.append(projection);
    const themeLabel=document.createElement('label');themeLabel.textContent='Static theme';
    const theme=document.createElement('select');theme.id='staticTheme';theme.replaceChildren(new Option('Retro','retro'),new Option('Clean','clean'),new Option('Futuristic','futuristic'),new Option('Rough / field-map','rough'));addThemeOptions(theme);themeLabel.append(theme);
    box.append(projectionLabel,themeLabel,makeHeading('Static visible text'),makeToggle('staticShowName','Station label'),makeToggle('staticShowStats','QSO count'),makeToggle('staticShowLegend','Band legend'),makeToggle('staticShowDxcc','DXCC summary'),makeToggle('staticShowUpdated','Generated timestamp'));
    const note=document.createElement('small');note.textContent='Theme and projection are visual-only. Real Earth uses a locally cached NASA Blue Marble texture; visitor browsers do not contact NASA. The PNG still uses only the sanitized public snapshot.';box.append(note);
    staticPreview.before(box);
  }

  const checked=id=>$(id)?.checked!==false;
  const setFlag=(url,name,on)=>{if(on)url.searchParams.delete(name);else url.searchParams.set(name,'0');};
  const staticTheme=()=>staticThemes.has($('staticTheme')?.value)?$('staticTheme').value:'retro';
  let rewritingIframe=false,rewritingStatic=false,publicOrigin='';

  function rememberPublicOrigin(){
    const iframeText=iframePre?.textContent||'',iframeMatch=iframeText.match(/src="([^"]+)"/);
    if(iframeMatch){try{const url=new URL(iframeMatch[1],location.origin);if(url.origin!==location.origin||!publicOrigin)publicOrigin=url.origin;}catch{}}
    const snippetText=$('staticSnippet')?.textContent||'',staticMatch=snippetText.match(/https?:\/\/[^\s<]+\/static\/qrz\.png/);
    if(staticMatch){try{const url=new URL(staticMatch[0]);if(url.origin!==location.origin||!publicOrigin)publicOrigin=url.origin;}catch{}}
    return publicOrigin||location.origin;
  }

  function applyEmbedControls(){
    if(rewritingIframe||!iframePre)return;
    const text=iframePre.textContent||'',match=text.match(/src="([^"]+)"/);if(!match)return;
    const url=new URL(match[1],location.origin);publicOrigin=url.origin;
    setFlag(url,'name',checked('embedShowName'));setFlag(url,'stats',checked('embedShowStats'));setFlag(url,'legend',checked('embedShowLegend'));setFlag(url,'dxcc',checked('embedShowDxcc'));setFlag(url,'details',checked('embedShowDetails'));
    const next=text.replace(match[1],url.toString());
    if(next!==text){rewritingIframe=true;iframePre.textContent=next;rewritingIframe=false;}
    const preview=$('preview');if(preview){const local=new URL('/embed',location.origin);setFlag(local,'name',checked('embedShowName'));setFlag(local,'stats',checked('embedShowStats'));setFlag(local,'legend',checked('embedShowLegend'));setFlag(local,'dxcc',checked('embedShowDxcc'));setFlag(local,'details',checked('embedShowDetails'));local.searchParams.set('preview',String(Date.now()));preview.src=local.pathname+local.search;}
  }

  function staticUrl(){
    const url=new URL('/static/qrz.png',rememberPublicOrigin());
    url.searchParams.set('projection',$('staticProjection')?.value==='mercator'?'mercator':'globe');
    url.searchParams.set('theme',staticTheme());
    setFlag(url,'name',checked('staticShowName'));setFlag(url,'stats',checked('staticShowStats'));setFlag(url,'legend',checked('staticShowLegend'));setFlag(url,'dxcc',checked('staticShowDxcc'));setFlag(url,'updated',checked('staticShowUpdated'));
    return url;
  }

  function applyStaticControls(){
    if(rewritingStatic||!staticPreview)return;
    const url=staticUrl(),preview=new URL('/static/qrz.png',location.origin);preview.searchParams.set('projection',$('staticProjection')?.value==='mercator'?'mercator':'globe');preview.searchParams.set('theme',staticTheme());setFlag(preview,'name',checked('staticShowName'));setFlag(preview,'stats',checked('staticShowStats'));setFlag(preview,'legend',checked('staticShowLegend'));setFlag(preview,'dxcc',checked('staticShowDxcc'));setFlag(preview,'updated',checked('staticShowUpdated'));preview.searchParams.set('preview',String(Date.now()));staticPreview.src=preview.pathname+preview.search;
    const snippet=$('staticSnippet');if(snippet){const imageUrl=url.toString(),embedUrl=new URL('/embed',rememberPublicOrigin()).toString();const next=`Static image URL:\n${imageUrl}\n\nLinked image:\n<a href="${embedUrl}" target="_blank" rel="noopener">\n  <img src="${imageUrl}" width="640" height="500" alt="QSO Trails map">\n</a>`;if(snippet.textContent!==next){rewritingStatic=true;snippet.textContent=next;rewritingStatic=false;}}
  }

  for(const id of ['embedShowName','embedShowStats','embedShowLegend','embedShowDxcc','embedShowDetails'])$(id)?.addEventListener('change',applyEmbedControls);
  for(const id of ['staticProjection','staticTheme','staticShowName','staticShowStats','staticShowLegend','staticShowDxcc','staticShowUpdated'])$(id)?.addEventListener('change',applyStaticControls);

  if(iframePre)new MutationObserver(()=>queueMicrotask(()=>{rememberPublicOrigin();applyEmbedControls();})).observe(iframePre,{childList:true,characterData:true,subtree:true});
  const staticSnippet=$('staticSnippet');if(staticSnippet)new MutationObserver(()=>queueMicrotask(()=>{rememberPublicOrigin();applyStaticControls();})).observe(staticSnippet,{childList:true,characterData:true,subtree:true});
  setTimeout(()=>{rememberPublicOrigin();applyEmbedControls();applyStaticControls();},0);
})();
