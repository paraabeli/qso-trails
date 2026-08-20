'use strict';
(()=>{
  const $=id=>document.getElementById(id);
  const canvas=$('c'),details=$('details'),dxcc=$('dxccSummary'),panel=$('dxccPanel'),grid=$('dxccGrid'),recordButton=$('recordButton'),downloadButton=$('downloadWebm'),replayRange=$('replayRange'),replayButton=$('replayButton'),loopToggle=$('loopToggle'),liveToggle=$('liveToggle');
  if(!canvas||!recordButton||!downloadButton)return;

  let recorder=null,chunks=[],recordingBlob=null,recordingUrl='',completionWatch=null,statsTimer=null;

  const labelEntity=item=>item?.country?`${item.country} · DXCC ${item.dxcc}`:`DXCC ${item?.dxcc||'?'}`;
  const makeSection=(title,lines)=>{
    const box=document.createElement('div'),strong=document.createElement('strong'),body=document.createElement('div');
    strong.textContent=title;body.style.marginTop='4px';body.style.lineHeight='1.45';body.textContent=lines.length?lines.join('\n'):'—';box.append(strong,body);return box;
  };

  function renderDxcc(stats){
    grid.replaceChildren();
    if(!stats){dxcc.textContent='DXCC progress: hidden by admin privacy settings';panel.hidden=true;return;}
    if(!stats.metadataAvailable){dxcc.textContent='DXCC progress: metadata unavailable · full resync or ADIF re-upload may be required';panel.hidden=true;return;}
    dxcc.textContent=`DXCC progress: ${Number(stats.entities||0).toLocaleString()} entities · ${Number(stats.countries||0).toLocaleString()} countries · ${Number(stats.continents||0)} continents`;
    panel.hidden=false;
    const byCont=(stats.byContinent||[]).map(x=>`${x.name}: ${Number(x.qsos||0).toLocaleString()} QSOs`);
    const top=(stats.topDxcc||[]).map(x=>`${labelEntity(x)}: ${Number(x.qsos||0).toLocaleString()} QSOs`);
    const bands=(stats.byBand||[]).slice(0,12).map(x=>`${x.band}: ${Number(x.entities||0)} entities · ${Number(x.qsos||0).toLocaleString()} QSOs`);
    const modes=Array.isArray(stats.byMode)?stats.byMode.slice(0,12).map(x=>`${x.mode}: ${Number(x.entities||0)} entities · ${Number(x.qsos||0).toLocaleString()} QSOs`):['Hidden because mode is not public'];
    const far=stats.farthest?[`${labelEntity(stats.farthest)} · ${Number(stats.farthest.distanceKm||0).toLocaleString()} km`]:[];
    const newest=stats.newestFirstWorked?[`${labelEntity(stats.newestFirstWorked)} · ${stats.newestFirstWorked.date}`]:['Hidden because dates are not public'];
    grid.append(makeSection('By continent',byCont),makeSection('Top entities',top),makeSection('By band',bands),makeSection('By mode',modes),makeSection('Most distant entity',far),makeSection('Newest first-worked',newest));
  }

  async function refreshDxcc(){
    try{
      const response=await fetch('/api/public',{cache:'no-store'});
      if(!response.ok)return;
      const data=await response.json();
      renderDxcc(data?.stats?.dxcc??null);
    }catch{}
  }

  function clearRecordingUrl(){if(recordingUrl){URL.revokeObjectURL(recordingUrl);recordingUrl='';}}
  function stopRecording(){if(recorder&&recorder.state==='recording')recorder.stop();}

  recordButton.onclick=()=>{
    if(recorder&&recorder.state==='recording'){stopRecording();return;}
    if(!canvas.captureStream||typeof MediaRecorder==='undefined'){details.textContent='WebM export is not supported by this browser.';return;}
    clearRecordingUrl();recordingBlob=null;chunks=[];downloadButton.hidden=true;
    const stream=canvas.captureStream(30);
    let mimeType='video/webm';
    if(MediaRecorder.isTypeSupported('video/webm;codecs=vp9'))mimeType='video/webm;codecs=vp9';
    else if(MediaRecorder.isTypeSupported('video/webm;codecs=vp8'))mimeType='video/webm;codecs=vp8';
    try{recorder=new MediaRecorder(stream,{mimeType});}catch(error){details.textContent=`WebM recorder could not start: ${error.message||error}`;return;}
    recorder.ondataavailable=event=>{if(event.data&&event.data.size)chunks.push(event.data);};
    recorder.onstop=()=>{
      clearInterval(completionWatch);completionWatch=null;
      recordingBlob=new Blob(chunks,{type:recorder.mimeType||'video/webm'});
      recordButton.textContent='Export WebM';canvas.classList.remove('recording');
      if(!recordingBlob.size){details.textContent='The browser created an empty WebM recording.';return;}
      recordingUrl=URL.createObjectURL(recordingBlob);downloadButton.hidden=false;
      details.textContent=`Replay recording ready (${(recordingBlob.size/1024/1024).toFixed(1)} MB). Click Download WebM.`;
    };
    recorder.start(1000);canvas.classList.add('recording');recordButton.textContent='Stop recording';
    replayRange.value='0';replayRange.dispatchEvent(new Event('input',{bubbles:true}));
    if(replayButton.textContent!=='Pause')replayButton.click();
    details.textContent='Recording replay to WebM…';
    completionWatch=setInterval(()=>{if(recorder?.state==='recording'&&!loopToggle.checked&&replayButton.textContent==='Replay'&&Number(replayRange.value)>=999)stopRecording();},250);
  };

  downloadButton.onclick=async()=>{
    if(!recordingBlob||!recordingBlob.size){details.textContent='No completed WebM recording is ready.';return;}
    const filename=`qso-trails-replay-${new Date().toISOString().replace(/[:.]/g,'-')}.webm`;
    if('showSaveFilePicker' in window){
      try{
        const handle=await window.showSaveFilePicker({suggestedName:filename,types:[{description:'WebM video',accept:{'video/webm':['.webm']}}]});
        const writable=await handle.createWritable();await writable.write(recordingBlob);await writable.close();details.textContent='Replay WebM saved.';return;
      }catch(error){if(error?.name==='AbortError'){details.textContent='Save cancelled.';return;}}
    }
    try{
      const a=document.createElement('a');a.href=recordingUrl||URL.createObjectURL(recordingBlob);a.download=filename;a.target='_blank';a.rel='noopener';document.body.appendChild(a);a.click();a.remove();details.textContent='WebM download started. If your host blocks iframe downloads, open this embed directly and click Download WebM again.';
    }catch(error){details.textContent='This iframe host blocked the download. Open the embed directly in a browser tab and try again.';}
  };

  function updateStatsTimer(){clearInterval(statsTimer);statsTimer=null;if(liveToggle?.checked)statsTimer=setInterval(refreshDxcc,60000);}
  liveToggle?.addEventListener('change',updateStatsTimer);
  refreshDxcc();updateStatsTimer();
})();
