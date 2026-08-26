'use strict';
(()=>{
  const $=id=>document.getElementById(id);
  const query=new URLSearchParams(location.search);
  const enabled=(name,fallback=true)=>{const value=query.get(name);return value==null?fallback:!['0','false','off','no'].includes(value.toLowerCase());};
  const showName=enabled('name'),showStats=enabled('stats'),showLegend=enabled('legend'),showDxcc=enabled('dxcc'),showDetails=enabled('details'),showWebm=enabled('webm'),showReplayControls=enabled('replaycontrols'),showTools=enabled('tools');
  const filteredDays=Math.max(0,Math.min(3650,Number(query.get('days'))||0));
  const requestedBand=String(query.get('band')||'all').trim().toLowerCase();
  const earthMode=String(query.get('theme')||'').trim().toLowerCase()==='earth';
  const canvas=$('c'),details=$('details'),dxcc=$('dxccSummary'),panel=$('dxccPanel'),grid=$('dxccGrid'),recordButton=$('recordButton'),downloadButton=$('downloadWebm'),replayBox=$('replay'),replayRange=$('replayRange'),replayButton=$('replayButton'),loopToggle=$('loopToggle'),liveToggle=$('liveToggle'),bandReplay=$('bandReplay'),toolsBox=document.querySelector('.tools');
  if(!canvas||!recordButton||!downloadButton)return;

  if($('name'))$('name').hidden=!showName;
  if($('stats'))$('stats').hidden=!showStats;
  if($('legend'))$('legend').hidden=!showLegend;
  if(details)details.hidden=!showDetails;
  const hint=document.querySelector('.hint');if(hint)hint.hidden=!showDetails;
  if(dxcc)dxcc.hidden=!showDxcc;
  if(panel)panel.hidden=!showDxcc;
  if(toolsBox&&!showTools){toolsBox.hidden=true;toolsBox.style.display='none';}
  recordButton.hidden=!showWebm||!showTools;
  downloadButton.hidden=true;
  if(replayBox&&!showReplayControls){replayBox.hidden=true;replayBox.style.display='none';}
  if(earthMode){
    const credit=document.createElement('div');
    credit.id='nasaImageryCredit';credit.textContent='3D globe · NASA Blue Marble: Next Generation · checking texture…';
    credit.style.marginTop='6px';credit.style.fontSize='10px';credit.style.opacity='.82';credit.style.lineHeight='1.25';
    panel?.after(credit);
    fetch(`/assets/earth-blue-marble.png?status=${Date.now()}`,{method:'HEAD',cache:'no-store'}).then(response=>{
      credit.textContent=response.ok?'3D globe · Imagery: NASA Earth Observatory · Blue Marble: Next Generation':`3D globe · NASA imagery unavailable (${response.status}) · vector globe fallback active`;
    }).catch(()=>{credit.textContent='3D globe · NASA imagery status unavailable · vector globe fallback may be active';});
  }

  let recorder=null,chunks=[],recordingBlob=null,recordingUrl='',completionWatch=null,statsTimer=null,bandTouched=false;

  function visuallyFiltered(){const selected=bandTouched?String(bandReplay?.value||'all').trim().toLowerCase():requestedBand;return(selected&&selected!=='all')||filteredDays>0;}
  const labelEntity=item=>item?.country?`${item.country} · DXCC ${item.dxcc}`:`DXCC ${item?.dxcc||'?'}`;
  const makeSection=(title,lines)=>{
    const box=document.createElement('div'),strong=document.createElement('strong'),body=document.createElement('div');
    strong.textContent=title;body.style.marginTop='4px';body.style.lineHeight='1.45';body.textContent=lines.length?lines.join('\n'):'—';box.append(strong,body);return box;
  };

  function renderDxcc(stats){
    if(!showDxcc){if(dxcc)dxcc.hidden=true;if(panel)panel.hidden=true;return;}
    grid.replaceChildren();dxcc.hidden=false;
    if(visuallyFiltered()){dxcc.textContent='DXCC progress: unavailable for filtered view';panel.hidden=true;return;}
    if(!stats){dxcc.textContent='DXCC progress: hidden by admin privacy settings';panel.hidden=true;return;}
    if(!stats.metadataAvailable){dxcc.textContent='DXCC progress: metadata unavailable · full resync or ADIF re-upload may be required';panel.hidden=true;return;}
    dxcc.textContent=`DXCC progress: ${Number(stats.entities||0).toLocaleString()} entities · ${Number(stats.countries||0).toLocaleString()} countries · ${Number(stats.continents||0)} continents`;
    panel.hidden=false;
    const byCont=(stats.byContinent||[]).map(x=>`${x.name}: ${Number(x.qsos||0).toLocaleString()} QSOs`);
    const top=(stats.topDxcc||[]).map(x=>`${labelEntity(x)}: ${Number(x.qsos||0).toLocaleString()} QSOs`);
    const rare=(stats.rarestWorked||[]).map(x=>`Most Wanted #${Number(x.rank)} · ${labelEntity(x)} · ${Number(x.qsos||0).toLocaleString()} QSOs`);
    const rarityTitle=stats.raritySource?.name?`Rarest worked · ${stats.raritySource.name}${stats.raritySource.stale?' (cached)':''}`:'Rarest worked';
    const bands=(stats.byBand||[]).slice(0,12).map(x=>`${x.band}: ${Number(x.entities||0)} entities · ${Number(x.qsos||0).toLocaleString()} QSOs`);
    const modes=Array.isArray(stats.byMode)?stats.byMode.slice(0,12).map(x=>`${x.mode}: ${Number(x.entities||0)} entities · ${Number(x.qsos||0).toLocaleString()} QSOs`):['Hidden because mode is not public'];
    const far=stats.farthest?[`${labelEntity(stats.farthest)} · ${Number(stats.farthest.distanceKm||0).toLocaleString()} km`]:[];
    const newest=stats.newestFirstWorked?[`${labelEntity(stats.newestFirstWorked)} · ${stats.newestFirstWorked.date}`]:['Hidden because dates are not public'];
    grid.append(makeSection('By continent',byCont),makeSection('Top entities',top),makeSection(rarityTitle,rare),makeSection('By band',bands),makeSection('By mode',modes),makeSection('Most distant entity',far),makeSection('Newest first-worked',newest));
  }

  async function refreshDxcc(){
    if(!showDxcc)return;
    if(visuallyFiltered()){renderDxcc(null);return;}
    try{
      const response=await fetch('/api/public',{cache:'no-store'});
      if(!response.ok)return;
      const data=await response.json();
      renderDxcc(data?.stats?.dxcc??null);
    }catch{}
  }

  function clearRecordingUrl(){if(recordingUrl){URL.revokeObjectURL(recordingUrl);recordingUrl='';}}
  function stopRecording(){if(recorder&&recorder.state==='recording')recorder.stop();}
  const message=text=>{if(details&&!details.hidden)details.textContent=text;};

  recordButton.onclick=()=>{
    if(!showWebm||!showTools)return;
    if(recorder&&recorder.state==='recording'){stopRecording();return;}
    if(!canvas.captureStream||typeof MediaRecorder==='undefined'){message('WebM export is not supported by this browser.');return;}
    clearRecordingUrl();recordingBlob=null;chunks=[];downloadButton.hidden=true;
    const stream=canvas.captureStream(30);
    let mimeType='video/webm';
    if(MediaRecorder.isTypeSupported('video/webm;codecs=vp9'))mimeType='video/webm;codecs=vp9';
    else if(MediaRecorder.isTypeSupported('video/webm;codecs=vp8'))mimeType='video/webm;codecs=vp8';
    try{recorder=new MediaRecorder(stream,{mimeType});}catch(error){message(`WebM recorder could not start: ${error.message||error}`);return;}
    recorder.ondataavailable=event=>{if(event.data&&event.data.size)chunks.push(event.data);};
    recorder.onstop=()=>{
      clearInterval(completionWatch);completionWatch=null;
      recordingBlob=new Blob(chunks,{type:recorder.mimeType||'video/webm'});
      recordButton.textContent='Export WebM';canvas.classList.remove('recording');
      if(!recordingBlob.size){message('The browser created an empty WebM recording.');return;}
      recordingUrl=URL.createObjectURL(recordingBlob);downloadButton.hidden=!showWebm||!showTools;
      message(`Replay recording ready (${(recordingBlob.size/1024/1024).toFixed(1)} MB). Click Download WebM.`);
    };
    recorder.start(1000);canvas.classList.add('recording');recordButton.textContent='Stop recording';
    replayRange.value='0';replayRange.dispatchEvent(new Event('input',{bubbles:true}));
    if(replayButton.textContent!=='Pause')replayButton.click();
    message('Recording replay to WebM…');
    completionWatch=setInterval(()=>{if(recorder?.state==='recording'&&!loopToggle.checked&&replayButton.textContent==='Replay'&&Number(replayRange.value)>=999)stopRecording();},250);
  };

  downloadButton.onclick=async()=>{
    if(!showWebm||!showTools)return;
    if(!recordingBlob||!recordingBlob.size){message('No completed WebM recording is ready.');return;}
    const filename=`qso-trails-replay-${new Date().toISOString().replace(/[:.]/g,'-')}.webm`;
    if('showSaveFilePicker' in window){
      try{
        const handle=await window.showSaveFilePicker({suggestedName:filename,types:[{description:'WebM video',accept:{'video/webm':['.webm']}}]});
        const writable=await handle.createWritable();await writable.write(recordingBlob);await writable.close();message('Replay WebM saved.');return;
      }catch(error){if(error?.name==='AbortError'){message('Save cancelled.');return;}}
    }
    try{
      const a=document.createElement('a');a.href=recordingUrl||URL.createObjectURL(recordingBlob);a.download=filename;a.target='_blank';a.rel='noopener';document.body.appendChild(a);a.click();a.remove();message('WebM download started. If your host blocks iframe downloads, open this embed directly and click Download WebM again.');
    }catch(error){message('This iframe host blocked the download. Open the embed directly in a browser tab and try again.');}
  };

  function updateStatsTimer(){clearInterval(statsTimer);statsTimer=null;if(showDxcc&&!visuallyFiltered()&&liveToggle?.checked)statsTimer=setInterval(refreshDxcc,60000);}
  liveToggle?.addEventListener('change',updateStatsTimer);
  bandReplay?.addEventListener('change',()=>{bandTouched=true;refreshDxcc();updateStatsTimer();});
  refreshDxcc();updateStatsTimer();
})();
