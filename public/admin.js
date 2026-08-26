'use strict';

const $ = id => document.getElementById(id);
let stateData = null;
let csrfToken = '';

function selected(id) {
  return [...$(id).querySelectorAll('input[type="checkbox"]:checked')].map(input => input.value);
}

function checkboxList(id, values, current) {
  const container = $(id);
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
  if (!response.ok) throw Error(data.error || `Request failed (${response.status})`);
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
  $('exposure').textContent = [
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
    `${optional.remoteGrid ? '✓' : '✗'} remote grid`,
    `${optional.dxccAggregates ? '✓' : '✗'} aggregate DXCC statistics`
  ].join('\n');
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

function setHiddenFlag(params, name, controlId) {
  const control = $(controlId);
  if (control && !control.checked) params.set(name, '0');
}

function visualQuery() {
  const params = new URLSearchParams();
  const days = Number($('visualDays').value) || 0;
  const replay = Number($('visualReplay').value) || 0;
  if (days) params.set('days', String(days));
  if ($('visualGrayline').checked) params.set('grayline', '1');
  params.set('theme', $('visualTheme').value);
  params.set('mode', $('visualMode').value);
  params.set('opacity', String(Number($('visualOpacity').value) || 32));
  if (replay) params.set('replay', String(replay));
  if ($('visualLoop').checked) params.set('loop', '1');
  if ($('visualFollow').checked) params.set('follow', '1');
  if ($('visualRelative').checked) params.set('timing', 'relative');
  if (!$('visualFade').checked) params.set('fade', '0');
  if ($('visualBand').value !== 'all') params.set('band', $('visualBand').value);
  if ($('visualLive').checked) params.set('live', '1');
  setHiddenFlag(params, 'name', 'embedShowName');
  setHiddenFlag(params, 'stats', 'embedShowStats');
  setHiddenFlag(params, 'legend', 'embedShowLegend');
  setHiddenFlag(params, 'dxcc', 'embedShowDxcc');
  setHiddenFlag(params, 'details', 'embedShowDetails');
  setHiddenFlag(params, 'webm', 'embedShowWebm');
  setHiddenFlag(params, 'replaycontrols', 'embedShowReplay');
  return `?${params.toString()}`;
}

function renderIframe() {
  const size = iframeSize();
  const base = stateData?.publicBaseUrl || location.origin;
  const query = visualQuery();
  const src = `${base}/embed${query}`;
  $('iframe').textContent = `<iframe src="${src}" width="${size.width}" height="${size.height}" style="border:0" loading="lazy"></iframe>`;
  $('preview').style.width = typeof size.width === 'number' ? `${size.width}px` : '100%';
  $('preview').style.maxWidth = '100%';
  $('preview').style.height = `${size.height}px`;
  $('preview').src = `/embed${query}&preview=${Date.now()}`;
  $('iframeCustom').hidden = $('iframeSize').value !== 'custom';
  $('visualOpacityValue').textContent = `${$('visualOpacity').value}%`;
}

function staticTheme() {
  const allowed = new Set(['retro', 'clean', 'futuristic', 'rough', 'midnight', 'aurora', 'amber', 'mono', 'ice', 'earth']);
  return allowed.has($('staticTheme')?.value) ? $('staticTheme').value : 'retro';
}

function staticWidth() {
  return Math.max(320, Math.min(3840, Math.round(Number($('staticWidth')?.value) || 640)));
}

function staticHeight(width, theme) {
  return theme === 'earth' ? Math.round(width / 2) : Math.round(width * 500 / 640);
}

function staticParams(widthOverride = null) {
  const params = new URLSearchParams();
  const theme = staticTheme();
  params.set('projection', $('staticProjection')?.value === 'mercator' ? 'mercator' : 'globe');
  params.set('theme', theme);
  params.set('width', String(widthOverride || staticWidth()));
  setHiddenFlag(params, 'name', 'staticShowName');
  setHiddenFlag(params, 'stats', 'staticShowStats');
  setHiddenFlag(params, 'legend', 'staticShowLegend');
  setHiddenFlag(params, 'dxcc', 'staticShowDxcc');
  setHiddenFlag(params, 'updated', 'staticShowUpdated');
  return params;
}

function renderStaticPublish() {
  if (!$('staticPreview')) return;
  const base = stateData?.publicBaseUrl || location.origin;
  const theme = staticTheme();
  const width = staticWidth();
  const height = staticHeight(width, theme);
  const params = staticParams();
  const imageUrl = `${base}/static/qrz.png?${params.toString()}`;
  const embedUrl = `${base}/embed`;
  $('staticSnippet').textContent = `Static image URL:\n${imageUrl}\n\nLinked image:\n<a href="${embedUrl}" target="_blank" rel="noopener">\n  <img src="${imageUrl}" width="${width}" height="${height}" alt="QSO Trails map">\n</a>`;
  const previewParams = staticParams(Math.min(width, 1024));
  previewParams.set('preview', String(Date.now()));
  $('staticPreview').src = `/static/qrz.png?${previewParams.toString()}`;
}

async function checkEarthTexture() {
  const status = $('earthStatus');
  if (!status) return;
  try {
    const response = await fetch(`/assets/earth-blue-marble.png?check=${Date.now()}`, { method: 'HEAD', cache: 'no-store' });
    status.textContent = response.ok
      ? 'NASA Blue Marble NG status: texture available. Earth theme renders on the interactive 3D sphere; static output follows the Projection selector.'
      : `NASA Blue Marble NG status: unavailable (${response.status}). Earth mode will fall back until the server can refresh its NASA cache.`;
  } catch (error) {
    status.textContent = `NASA Blue Marble NG status: check failed (${error.message || error}).`;
  }
}

function syncVisualAvailability() {
  const enabled = $('showDates').checked;
  for (const id of ['visualDays', 'visualReplay', 'visualLoop', 'visualFollow', 'visualRelative', 'visualFade']) $(id).disabled = !enabled;
  $('visualDaysNote').textContent = enabled
    ? 'Date filtering and replay apply only to the sanitized public snapshot.'
    : 'Enable “Expose QSO dates publicly” before using date filtering or replay.';
  if (!enabled) {
    $('visualDays').value = '0';
    $('visualReplay').value = '0';
    $('visualLoop').checked = false;
    $('visualFollow').checked = false;
    $('visualRelative').checked = false;
  }
  renderIframe();
}

function preset(name) {
  if (name === 'qrz') {
    $('iframeSize').value = 'qrz';
    $('visualTheme').value = 'night';
    $('visualMode').value = 'paths';
    $('visualOpacity').value = '32';
    $('visualDays').value = '0';
    $('visualReplay').value = '0';
    $('visualBand').value = 'all';
  } else if (name === '20m') {
    $('visualTheme').value = 'ocean';
    $('visualMode').value = 'both';
    $('visualOpacity').value = '38';
    $('visualBand').value = '20M';
  } else if (name === 'ft8') {
    $('visualMode').value = 'density';
    $('visualDays').value = '30';
  } else if (name === 'contest') {
    $('visualDays').value = '1';
    $('visualMode').value = 'paths';
    $('visualReplay').value = '1';
    $('visualLoop').checked = true;
    $('visualFollow').checked = true;
    $('visualRelative').checked = true;
    $('visualFade').checked = true;
  }
  renderIframe();
}

async function loadState() {
  stateData = await readJson(await fetch('/api/admin/state', { cache: 'no-store' }));
  csrfToken = stateData.csrfToken;
  const settings = stateData.settings;
  const wavelog = stateData.wavelog;
  $('name').value = settings.stationName || '';
  $('grid').value = settings.homeGrid || '';
  $('homePrecision').value = settings.homePrecision || 'grid4';
  $('remotePrecision').value = settings.remotePrecision || 'grid4';
  $('rotate').checked = !!settings.autoRotate;
  $('stats').checked = !!settings.showStats;
  $('calls').checked = !!settings.showCallsigns;
  $('showMode').checked = !!settings.showMode;
  $('showDates').checked = !!settings.showDates;
  $('showTimes').checked = !!settings.showTimes;
  $('showRemoteGrid').checked = !!settings.showRemoteGrid;
  $('showDxccStats').checked = settings.showDxccStats !== false;
  $('max').value = settings.maxPaths || 2500;
  checkboxList('bands', stateData.meta.bands, settings.bands || []);
  checkboxList('modes', stateData.meta.modes, settings.modes || []);
  $('visualBand').replaceChildren(new Option('All bands', 'all'), ...stateData.meta.bands.map(band => new Option(band, band)));
  $('wlurl').value = wavelog.baseUrl || '';
  $('wlstations').value = wavelog.stationIds || '';
  $('wlauto').value = wavelog.autoSyncMinutes || 0;
  $('tokenNote').textContent = wavelog.tokenConfigured
    ? `Token configured (${wavelog.tokenEncrypted ? 'encrypted at rest' : 'not encrypted; configure CONFIG_ENCRYPTION_KEY'}).`
    : 'No token configured.';
  $('wlstatus').textContent = wavelog.lastSyncAt
    ? `Last sync ${wavelog.lastSyncAt}; last ID ${wavelog.lastSyncId || 0}${wavelog.lastSyncError ? `; last error: ${wavelog.lastSyncError}` : ''}`
    : (wavelog.tokenConfigured ? 'Token configured; not synced yet.' : 'Not configured.');
  renderExposure(stateData.publicExposure);
  syncVisualAvailability();
  renderStaticPublish();
  await Promise.all([refreshPublicSample(), checkEarthTexture()]);
}

$('savewl').onclick = async () => {
  try {
    const result = await post('/api/admin/wavelog/config', { baseUrl: $('wlurl').value, token: $('wltoken').value, stationIds: $('wlstations').value, autoSyncMinutes: Number($('wlauto').value) });
    $('wltoken').value = '';
    $('wlstatus').textContent = result.tokenEncrypted ? 'Saved; token encrypted at rest.' : 'Saved.';
    await loadState();
  } catch (error) { $('wlstatus').textContent = error.message; }
};

$('testwl').onclick = async () => {
  try {
    const result = await post('/api/admin/wavelog/test', {});
    $('wlstatus').textContent = `Connection OK. Token sent only to ${result.host}.`;
  } catch (error) { $('wlstatus').textContent = error.message; }
};

async function sync(full) {
  try {
    $('wlstatus').textContent = 'Syncing…';
    const result = await post('/api/admin/wavelog/sync', { full });
    $('wlstatus').textContent = `Fetched ${result.fetched}, usable ${result.usable}, stored ${result.stored}.`;
    await loadState();
  } catch (error) { $('wlstatus').textContent = error.message; }
}

$('syncwl').onclick = () => sync(false);
$('fullwl').onclick = () => sync(true);
$('upload').onclick = async () => {
  const file = $('adif').files[0];
  if (!file) return;
  try {
    const form = new FormData();
    form.append('adif', file);
    const result = await readJson(await fetch('/api/admin/upload', { method: 'POST', headers: { 'X-CSRF-Token': csrfToken }, body: form }));
    $('status').textContent = `Imported ${result.importedRecords.toLocaleString()} records; ${result.usableQsos.toLocaleString()} have usable positions.`;
    await loadState();
  } catch (error) { $('status').textContent = error.message; }
};

$('publish').onclick = async () => {
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
      showDxccStats: $('showDxccStats').checked,
      homePrecision: $('homePrecision').value,
      remotePrecision: $('remotePrecision').value,
      maxPaths: Number($('max').value)
    });
    $('status').textContent = `Published ${result.visibleQsos.toLocaleString()} selected QSOs; ${result.returnedQsos.toLocaleString()} records are sent to browsers.`;
    renderExposure(result.publicExposure);
    await refreshPublicSample();
    renderStaticPublish();
    syncVisualAvailability();
  } catch (error) { $('status').textContent = error.message; }
};

$('visualPreset').onchange = () => preset($('visualPreset').value);
$('savePreset').onclick = () => {
  localStorage.setItem('qsoTrailsEmbedPreset', JSON.stringify({
    size: $('iframeSize').value,
    days: $('visualDays').value,
    gray: $('visualGrayline').checked,
    theme: $('visualTheme').value,
    mode: $('visualMode').value,
    opacity: $('visualOpacity').value,
    replay: $('visualReplay').value,
    loop: $('visualLoop').checked,
    follow: $('visualFollow').checked,
    relative: $('visualRelative').checked,
    fade: $('visualFade').checked,
    band: $('visualBand').value,
    live: $('visualLive').checked,
    name: $('embedShowName').checked,
    stats: $('embedShowStats').checked,
    legend: $('embedShowLegend').checked,
    dxcc: $('embedShowDxcc').checked,
    details: $('embedShowDetails').checked,
    webm: $('embedShowWebm').checked,
    replayControls: $('embedShowReplay').checked
  }));
  $('status').textContent = 'Saved My preset in this browser.';
};

const saved = localStorage.getItem('qsoTrailsEmbedPreset');
if (saved) {
  const option = document.createElement('option');
  option.value = 'my';
  option.textContent = 'My preset';
  $('visualPreset').append(option);
  $('visualPreset').addEventListener('change', () => {
    if ($('visualPreset').value !== 'my') return;
    try {
      const presetData = JSON.parse(saved);
      $('iframeSize').value = presetData.size || 'responsive';
      $('visualDays').value = presetData.days || '0';
      $('visualGrayline').checked = presetData.gray !== false;
      $('visualTheme').value = presetData.theme || 'night';
      $('visualMode').value = presetData.mode || 'paths';
      $('visualOpacity').value = presetData.opacity || '32';
      $('visualReplay').value = presetData.replay || '0';
      $('visualLoop').checked = !!presetData.loop;
      $('visualFollow').checked = !!presetData.follow;
      $('visualRelative').checked = !!presetData.relative;
      $('visualFade').checked = presetData.fade !== false;
      $('visualBand').value = presetData.band || 'all';
      $('visualLive').checked = !!presetData.live;
      $('embedShowName').checked = presetData.name !== false;
      $('embedShowStats').checked = presetData.stats !== false;
      $('embedShowLegend').checked = presetData.legend !== false;
      $('embedShowDxcc').checked = presetData.dxcc !== false;
      $('embedShowDetails').checked = presetData.details !== false;
      $('embedShowWebm').checked = presetData.webm !== false;
      $('embedShowReplay').checked = presetData.replayControls !== false;
      renderIframe();
    } catch {}
  });
}

for (const id of ['iframeSize', 'visualDays', 'visualGrayline', 'visualTheme', 'visualMode', 'visualReplay', 'visualLoop', 'visualFollow', 'visualRelative', 'visualFade', 'visualBand', 'visualLive', 'embedShowName', 'embedShowStats', 'embedShowLegend', 'embedShowDxcc', 'embedShowDetails', 'embedShowWebm', 'embedShowReplay']) {
  $(id)?.addEventListener('change', renderIframe);
}
for (const id of ['staticProjection', 'staticTheme', 'staticWidth', 'staticShowName', 'staticShowStats', 'staticShowLegend', 'staticShowDxcc', 'staticShowUpdated']) {
  $(id)?.addEventListener('change', renderStaticPublish);
}
$('visualOpacity').addEventListener('input', renderIframe);
$('showDates').addEventListener('change', syncVisualAvailability);
$('iframeWidth').addEventListener('input', renderIframe);
$('iframeHeight').addEventListener('input', renderIframe);
$('staticWidth')?.addEventListener('input', renderStaticPublish);

loadState().catch(error => $('status').textContent = error.message);
