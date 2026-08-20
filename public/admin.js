'use strict';
const $ = id => document.getElementById(id);
let stateData = null;
let csrfToken = '';

function selected(containerId) {
  return [...$(containerId).querySelectorAll('input[type="checkbox"]:checked')].map(input => input.value);
}

function checkboxList(containerId, values, current) {
  const container = $(containerId);
  container.replaceChildren();
  for (const value of values) {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = value;
    input.checked = current.includes(value);
    label.append(input, document.createTextNode(value));
    container.append(label);
  }
}

async function readJson(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

async function post(url, body) {
  return readJson(await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
    body: JSON.stringify(body)
  }));
}

function precisionLabel(value) {
  return value === 'exact' ? 'exact' : value === 'grid6' ? '6-character grid center' : '4-character grid center';
}

function renderExposure(exposure) {
  if (!exposure) return;
  const optional = exposure.optional || {};
  const lines = [
    `Public selected QSOs: ${Number(exposure.qsoCount || 0).toLocaleString()}`,
    `Records actually returned: ${Number(exposure.returnedQsos || 0).toLocaleString()}`,
    `Home position: ${precisionLabel(exposure.homePrecision)}`,
    `Remote positions: ${precisionLabel(exposure.remotePrecision)}`,
    '',
    'Always public for rendering:',
    '✓ approximate QSO coordinates',
    '✓ band',
    '',
    `${optional.callsign ? '✓' : '✗'} callsign`,
    `${optional.mode ? '✓' : '✗'} mode`,
    `${optional.date ? '✓' : '✗'} date`,
    `${optional.time ? '✓' : '✗'} time`,
    `${optional.remoteGrid ? '✓' : '✗'} remote grid`
  ];
  $('exposure').textContent = lines.join('\n');
}

async function refreshPublicSample() {
  try {
    const data = await readJson(await fetch('/api/public', { cache: 'no-store' }));
    const sample = { ...data, qsos: (data.qsos || []).slice(0, 3) };
    if ((data.qsos || []).length > 3) sample.sampleNote = `Showing 3 of ${data.qsos.length} returned QSO records.`;
    $('publicJson').textContent = JSON.stringify(sample, null, 2);
  } catch (error) {
    $('publicJson').textContent = error.message;
  }
}

function iframeSize() {
  const presets = {
    responsive: { width: '100%', height: 620 },
    compact: { width: 480, height: 420 },
    qrz: { width: 640, height: 500 },
    wide: { width: 900, height: 620 }
  };
  if ($('iframeSize').value !== 'custom') return presets[$('iframeSize').value] || presets.responsive;
  return {
    width: Math.max(320, Math.min(2000, Number($('iframeWidth').value) || 700)),
    height: Math.max(300, Math.min(1400, Number($('iframeHeight').value) || 550))
  };
}

function renderIframe() {
  const size = iframeSize();
  const base = stateData?.publicBaseUrl || window.location.origin;
  $('iframe').textContent = `<iframe src="${base}/embed" width="${size.width}" height="${size.height}" style="border:0" loading="lazy"></iframe>`;
  $('preview').style.width = typeof size.width === 'number' ? `${size.width}px` : '100%';
  $('preview').style.maxWidth = '100%';
  $('preview').style.height = `${size.height}px`;
  $('iframeCustom').hidden = $('iframeSize').value !== 'custom';
}

async function loadState() {
  stateData = await readJson(await fetch('/api/admin/state', { cache: 'no-store' }));
  csrfToken = stateData.csrfToken;
  const s = stateData.settings;
  const w = stateData.wavelog;
  $('name').value = s.stationName || '';
  $('grid').value = s.homeGrid || '';
  $('homePrecision').value = s.homePrecision || 'grid4';
  $('remotePrecision').value = s.remotePrecision || 'grid4';
  $('rotate').checked = Boolean(s.autoRotate);
  $('stats').checked = Boolean(s.showStats);
  $('calls').checked = Boolean(s.showCallsigns);
  $('showMode').checked = Boolean(s.showMode);
  $('showDates').checked = Boolean(s.showDates);
  $('showTimes').checked = Boolean(s.showTimes);
  $('showRemoteGrid').checked = Boolean(s.showRemoteGrid);
  $('max').value = s.maxPaths || 2500;
  checkboxList('bands', stateData.meta.bands, s.bands || []);
  checkboxList('modes', stateData.meta.modes, s.modes || []);
  $('wlurl').value = w.baseUrl || '';
  $('wlstations').value = w.stationIds || '';
  $('wlauto').value = w.autoSyncMinutes || 0;
  $('tokenNote').textContent = w.tokenConfigured ? `Token configured (${w.tokenEncrypted ? 'encrypted at rest' : 'not encrypted; configure CONFIG_ENCRYPTION_KEY'}).` : 'No token configured.';
  $('wlstatus').textContent = w.lastSyncAt ? `Last sync ${w.lastSyncAt}; last ID ${w.lastSyncId || 0}${w.lastSyncError ? `; last error: ${w.lastSyncError}` : ''}` : (w.tokenConfigured ? 'Token configured; not synced yet.' : 'Not configured.');
  renderExposure(stateData.publicExposure);
  renderIframe();
  await refreshPublicSample();
}

$('savewl').addEventListener('click', async () => {
  try {
    const result = await post('/api/admin/wavelog/config', {
      baseUrl: $('wlurl').value,
      token: $('wltoken').value,
      stationIds: $('wlstations').value,
      autoSyncMinutes: Number($('wlauto').value)
    });
    $('wltoken').value = '';
    $('wlstatus').textContent = result.tokenEncrypted ? 'Saved; token encrypted at rest.' : 'Saved.';
    await loadState();
  } catch (error) { $('wlstatus').textContent = error.message; }
});

$('testwl').addEventListener('click', async () => {
  try {
    const result = await post('/api/admin/wavelog/test', {});
    $('wlstatus').textContent = `Connection OK. Token sent only to ${result.host}.`;
  } catch (error) { $('wlstatus').textContent = error.message; }
});

async function sync(full) {
  try {
    $('wlstatus').textContent = 'Syncing…';
    const result = await post('/api/admin/wavelog/sync', { full });
    $('wlstatus').textContent = `Fetched ${result.fetched}, usable ${result.usable}, stored ${result.stored}.`;
    await loadState();
    $('preview').src = `/embed?refresh=${Date.now()}`;
  } catch (error) { $('wlstatus').textContent = error.message; }
}
$('syncwl').addEventListener('click', () => sync(false));
$('fullwl').addEventListener('click', () => sync(true));

$('upload').addEventListener('click', async () => {
  const file = $('adif').files[0];
  if (!file) return;
  try {
    const form = new FormData();
    form.append('adif', file);
    const result = await readJson(await fetch('/api/admin/upload', { method: 'POST', headers: { 'X-CSRF-Token': csrfToken }, body: form }));
    $('status').textContent = `Imported ${result.importedRecords.toLocaleString()} records; ${result.usableQsos.toLocaleString()} have usable positions.`;
    await loadState();
    $('preview').src = `/embed?refresh=${Date.now()}`;
  } catch (error) { $('status').textContent = error.message; }
});

$('publish').addEventListener('click', async () => {
  try {
    const result = await post('/api/admin/settings', {
      stationName: $('name').value,
      homeGrid: $('grid').value,
      bands: selected('bands'),
      modes: selected('modes'),
      autoRotate: $('rotate').checked,
      showStats: $('stats').checked,
      showCallsigns: $('calls').checked,
      showMode: $('showMode').checked,
      showDates: $('showDates').checked,
      showTimes: $('showTimes').checked,
      showRemoteGrid: $('showRemoteGrid').checked,
      homePrecision: $('homePrecision').value,
      remotePrecision: $('remotePrecision').value,
      maxPaths: Number($('max').value)
    });
    $('status').textContent = `Published ${result.visibleQsos.toLocaleString()} selected QSOs; ${result.returnedQsos.toLocaleString()} records are sent to browsers.`;
    renderExposure(result.publicExposure);
    await refreshPublicSample();
    $('preview').src = `/embed?refresh=${Date.now()}`;
  } catch (error) { $('status').textContent = error.message; }
});

$('iframeSize').addEventListener('change', renderIframe);
$('iframeWidth').addEventListener('input', renderIframe);
$('iframeHeight').addEventListener('input', renderIframe);

loadState().catch(error => { $('status').textContent = error.message; });
