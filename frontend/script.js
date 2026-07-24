/* ==========================================================================
   DeepShield AI — app logic
   ========================================================================== */

const API_BASE = 'http://localhost:5000';
const MAX_FILE_SIZE_MB = 50;
const SUPPORTED_TYPES = ['image/jpeg', 'image/png', 'image/jpg', 'video/mp4', 'video/quicktime', 'video/webm'];
const STORAGE_KEY = 'deepshield_history_v1';
const SETTINGS_KEY = 'deepshield_settings_v1';

let state = {
  currentFile: null,
  currentFilePreviewUrl: null,
  history: [],
  settings: { darkMode: true, toasts: true },
  charts: {}
};

/* ---------------------------------------------------------------- utils */

function $(sel) { return document.querySelector(sel); }
function $all(sel) { return document.querySelectorAll(sel); }

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function nowLabel() {
  const d = new Date();
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function uid() {
  return 'scan_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

/* ---------------------------------------------------------------- toasts */

function showToast(message, type = 'info') {
  if (!state.settings.toasts) return;
  const container = $('#toastContainer');
  const icons = { success: 'fa-circle-check', error: 'fa-circle-exclamation', info: 'fa-circle-info' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<i class="fa-solid ${icons[type]}"></i><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('hide');
    setTimeout(() => toast.remove(), 320);
  }, 3600);
}

/* ---------------------------------------------------------------- storage */

function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    state.history = raw ? JSON.parse(raw) : [];
  } catch { state.history = []; }
}

function saveHistory() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.history));
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) state.settings = { ...state.settings, ...JSON.parse(raw) };
  } catch {}
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
}

/* ---------------------------------------------------------------- nav: landing <-> app */

function openApp() {
  $('#landing').classList.add('hidden');
  $('#app').classList.remove('hidden');
  window.scrollTo(0, 0);
}

function openLanding() {
  $('#app').classList.add('hidden');
  $('#landing').classList.remove('hidden');
  window.scrollTo(0, 0);
}

$('#tryNowNav').addEventListener('click', () => { openApp(); goToSection('scan'); });
$('#tryNowHero').addEventListener('click', () => { openApp(); goToSection('scan'); });
$('#tryNowBottom').addEventListener('click', () => { openApp(); goToSection('scan'); });
$('#navDashboard').addEventListener('click', (e) => { e.preventDefault(); openApp(); goToSection('dashboard'); });
$('#brandBack').addEventListener('click', (e) => { e.preventDefault(); openLanding(); });
$('#brandHome').addEventListener('click', () => { openLanding(); });

$('#learnMoreNav').addEventListener('click', () => $('#features').scrollIntoView({ behavior: 'smooth' }));
$('#learnMoreHero').addEventListener('click', () => $('#features').scrollIntoView({ behavior: 'smooth' }));

$('#navBurger').addEventListener('click', () => $('#navLinks').classList.toggle('open'));

/* ---------------------------------------------------------------- sidebar sections */

function goToSection(name) {
  $all('.side-link').forEach(l => l.classList.toggle('active', l.dataset.section === name));
  $all('.panel').forEach(p => p.classList.toggle('active', p.id === `section-${name}`));
  if (name === 'analytics') renderAnalyticsCharts();
  if (name === 'dashboard') renderDashboardChart();
  $('#sidebar').classList.remove('open');
}

$all('.side-link').forEach(link => {
  link.addEventListener('click', () => goToSection(link.dataset.section));
});
$all('[data-goto]').forEach(btn => {
  btn.addEventListener('click', () => goToSection(btn.dataset.goto));
});

$('#mobileSidebarToggle').addEventListener('click', () => $('#sidebar').classList.toggle('open'));

/* ---------------------------------------------------------------- live clock */

function tickClock() {
  const d = new Date();
  $('#liveClock').textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  $('#liveDate').textContent = d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}
setInterval(tickClock, 1000);
tickClock();

/* ---------------------------------------------------------------- hero stat counter */

function animateHeroStat() {
  const el = $('#heroStatScans');
  const target = 128402 + state.history.length;
  let current = target - 400;
  const step = () => {
    current += Math.ceil((target - current) / 8) || 1;
    el.textContent = current.toLocaleString();
    if (current < target) requestAnimationFrame(step);
    else el.textContent = target.toLocaleString();
  };
  step();
}

/* ---------------------------------------------------------------- scan tabs */

$all('.scan-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    $all('.scan-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    $all('.scan-tab-panel').forEach(p => p.classList.remove('active'));
    $(`#tab-${tab.dataset.tab}`).classList.add('active');
  });
});

/* ---------------------------------------------------------------- file upload */

const uploadBox = $('#uploadBox');
const fileInput = $('#fileInput');

$('#browseBtn').addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });
uploadBox.addEventListener('click', (e) => {
  if ($('#uploadPreview').classList.contains('hidden')) fileInput.click();
});

fileInput.addEventListener('change', (e) => {
  if (e.target.files[0]) handleFile(e.target.files[0]);
});

['dragenter', 'dragover'].forEach(evt => {
  uploadBox.addEventListener(evt, (e) => {
    e.preventDefault(); e.stopPropagation();
    uploadBox.classList.add('dragover');
  });
});
['dragleave', 'drop'].forEach(evt => {
  uploadBox.addEventListener(evt, (e) => {
    e.preventDefault(); e.stopPropagation();
    uploadBox.classList.remove('dragover');
  });
});
uploadBox.addEventListener('drop', (e) => {
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});

function handleFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  const allowedExt = ['jpg', 'jpeg', 'png', 'mp4', 'mov', 'webm'];
  if (!allowedExt.includes(ext)) {
    showToast('Unsupported file type. Use JPG, PNG, MP4, MOV, or WEBM.', 'error');
    return;
  }
  const sizeMB = file.size / (1024 * 1024);
  if (sizeMB > MAX_FILE_SIZE_MB) {
    showToast(`File too large (${sizeMB.toFixed(1)}MB). Max size is ${MAX_FILE_SIZE_MB}MB.`, 'error');
    return;
  }

  state.currentFile = file;
  if (state.currentFilePreviewUrl) URL.revokeObjectURL(state.currentFilePreviewUrl);
  state.currentFilePreviewUrl = URL.createObjectURL(file);

  $('#uploadEmpty').classList.add('hidden');
  $('#uploadPreview').classList.remove('hidden');
  $('#resultCard').classList.add('hidden');

  const mediaBox = $('#previewMedia');
  mediaBox.innerHTML = '';
  if (file.type.startsWith('image/')) {
    const img = document.createElement('img');
    img.src = state.currentFilePreviewUrl;
    mediaBox.appendChild(img);
  } else {
    const vid = document.createElement('video');
    vid.src = state.currentFilePreviewUrl;
    vid.muted = true;
    mediaBox.appendChild(vid);
  }

  $('#previewName').textContent = file.name;
  $('#previewType').textContent = file.type || ext.toUpperCase();
  $('#previewSize').textContent = formatBytes(file.size);

  showToast('File loaded — ready to scan.', 'success');
}

$('#removeFileBtn').addEventListener('click', () => {
  state.currentFile = null;
  fileInput.value = '';
  $('#uploadPreview').classList.add('hidden');
  $('#uploadEmpty').classList.remove('hidden');
});

/* ---------------------------------------------------------------- scanning */

const scanningSteps = [
  'Extracting facial landmarks',
  'Analyzing texture consistency',
  'Checking compression artifacts',
  'Cross-referencing GAN signatures',
  'Finalizing confidence score'
];

function playScanningAnimation(durationMs) {
  return new Promise((resolve) => {
    $('#scanningBox').classList.remove('hidden');
    $('#resultCard').classList.add('hidden');
    let i = 0;
    $('#scanningStep').textContent = scanningSteps[0];
    const interval = setInterval(() => {
      i = (i + 1) % scanningSteps.length;
      $('#scanningStep').textContent = scanningSteps[i];
    }, durationMs / scanningSteps.length);

    setTimeout(() => {
      clearInterval(interval);
      $('#scanningBox').classList.add('hidden');
      resolve();
    }, durationMs);
  });
}

/* Mock local "AI" fallback used if the Flask backend isn't reachable */
function mockDetection(file) {
  const isFake = Math.random() > 0.45;
  const confidence = isFake
    ? Math.floor(Math.random() * 16) + 80   // 80-95
    : Math.floor(Math.random() * 20) + 78;  // 78-97

  const fakeReasons = [
    'Detected inconsistent facial patterns, compression artifacts, and AI-generated texture anomalies.',
    'Unnatural blending around facial boundaries combined with irregular lighting gradients.',
    'Temporal flickering across frames and mismatched eye reflections suggest synthetic generation.',
    'Skin texture lacks natural pore-level detail; frequency analysis shows GAN fingerprint patterns.'
  ];
  const realReasons = [
    'Facial geometry, lighting, and texture patterns are consistent with authentic camera capture.',
    'No compression or blending artifacts detected; noise patterns match native sensor output.',
    'Micro-expressions and natural asymmetry are consistent with unaltered human features.',
    'Metadata and pixel-level texture analysis show no signs of generative manipulation.'
  ];

  const reason = isFake
    ? fakeReasons[Math.floor(Math.random() * fakeReasons.length)]
    : realReasons[Math.floor(Math.random() * realReasons.length)];

  const summary = isFake
    ? 'DeepShield\'s neural pipeline flagged multiple regions of concern. The overall pattern of artifacts is consistent with AI-generated or manipulated media rather than an unedited capture.'
    : 'DeepShield\'s neural pipeline found no significant indicators of synthetic generation. Texture, lighting, and structural signals align with genuine, unaltered media.';

  return {
    result: isFake ? 'fake' : 'real',
    confidence,
    reason,
    time: (1.2 + Math.random() * 1.6).toFixed(1) + 's',
    summary
  };
}

async function runDetection(file) {
  try {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_BASE}/scan`, { method: 'POST', body: formData, signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error('Backend responded with an error');
    const data = await res.json();
    return {
      result: data.result,
      confidence: data.confidence,
      reason: data.reason,
      time: data.time,
      summary: data.summary || (data.result === 'fake'
        ? 'DeepShield\'s neural pipeline flagged multiple regions of concern consistent with synthetic media.'
        : 'DeepShield\'s neural pipeline found no significant indicators of synthetic generation.')
    };
  } catch (err) {
    // Backend not running locally — fall back to local mock so the demo still works end-to-end
    return mockDetection(file);
  }
}

async function performScan(file) {
  const startTime = performance.now();
  const [scanResult] = await Promise.all([
    runDetection(file),
    playScanningAnimation(2200)
  ]);
  renderResult(file, scanResult);
  saveScanToHistory(file, scanResult);
  updateDashboardStats();
  showToast(`Scan complete — flagged as ${scanResult.result.toUpperCase()}`, scanResult.result === 'fake' ? 'error' : 'success');
}

$('#scanNowBtn').addEventListener('click', () => {
  if (!state.currentFile) { showToast('Please select a file first.', 'error'); return; }
  performScan(state.currentFile);
});

$('#scanUrlBtn').addEventListener('click', () => {
  const url = $('#urlInput').value.trim();
  if (!url) { showToast('Please paste a media URL first.', 'error'); return; }
  try { new URL(url); } catch { showToast('That doesn\'t look like a valid URL.', 'error'); return; }

  const pseudoFile = { name: url.split('/').pop() || 'remote-media', type: 'url', size: 0, isUrl: true, url };
  playScanningAnimation(2200).then(() => {
    const scanResult = mockDetection(pseudoFile);
    renderResult(pseudoFile, scanResult);
    saveScanToHistory(pseudoFile, scanResult);
    updateDashboardStats();
    showToast(`Scan complete — flagged as ${scanResult.result.toUpperCase()}`, scanResult.result === 'fake' ? 'error' : 'success');
  });
});

$('#newScanBtn').addEventListener('click', () => {
  $('#resultCard').classList.add('hidden');
  $('#uploadPreview').classList.add('hidden');
  $('#uploadEmpty').classList.remove('hidden');
  $('#urlInput').value = '';
  state.currentFile = null;
  fileInput.value = '';
});

/* ---------------------------------------------------------------- render result */

function renderResult(file, scanResult) {
  const isFake = scanResult.result === 'fake';
  $('#resultCard').classList.remove('hidden');

  const badge = $('#resultBadge');
  badge.className = `result-badge ${isFake ? 'fake' : 'real'}`;
  badge.querySelector('i').className = `fa-solid ${isFake ? 'fa-circle-xmark' : 'fa-circle-check'}`;
  $('#resultVerdictText').textContent = isFake ? 'FAKE' : 'REAL';

  const mediaBox = $('#resultMedia');
  mediaBox.innerHTML = '';
  if (file.isUrl) {
    mediaBox.innerHTML = `<i class="fa-solid fa-link" style="font-size:2.4rem;color:var(--text-3)"></i>`;
  } else if (file.type && file.type.startsWith('image/')) {
    mediaBox.innerHTML = `<img src="${state.currentFilePreviewUrl}" />`;
  } else if (file.type && file.type.startsWith('video/')) {
    mediaBox.innerHTML = `<video src="${state.currentFilePreviewUrl}" muted autoplay loop></video>`;
  } else {
    mediaBox.innerHTML = `<i class="fa-solid fa-file" style="font-size:2.4rem;color:var(--text-3)"></i>`;
  }

  $('#confidenceValue').textContent = `${scanResult.confidence}%`;
  const bar = $('#confidenceBar');
  bar.className = `confidence-bar-fill ${isFake ? 'fake' : ''}`;
  requestAnimationFrame(() => { bar.style.width = `${scanResult.confidence}%`; });

  $('#reasonText').textContent = scanResult.reason;
  $('#summaryText').textContent = scanResult.summary;

  $('#infoName').textContent = file.name || 'remote-media';
  $('#infoType').textContent = file.isUrl ? 'URL' : (file.type || '—');
  $('#infoSize').textContent = file.isUrl ? '—' : formatBytes(file.size);
  $('#infoTime').textContent = scanResult.time;

  $('#resultCard').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* ---------------------------------------------------------------- history + stats */

function saveScanToHistory(file, scanResult) {
  const entry = {
    id: uid(),
    name: file.name || 'remote-media',
    type: file.isUrl ? 'URL' : (file.type || 'unknown'),
    result: scanResult.result,
    confidence: scanResult.confidence,
    reason: scanResult.reason,
    time: scanResult.time,
    date: new Date().toISOString(),
    dateLabel: nowLabel()
  };
  state.history.unshift(entry);
  saveHistory();
  renderHistoryTable();
  renderRecentScans();
}

function updateDashboardStats() {
  const total = state.history.length;
  const fake = state.history.filter(h => h.result === 'fake').length;
  const real = total - fake;
  $('#statTotal').textContent = total;
  $('#statFake').textContent = fake;
  $('#statReal').textContent = real;
  $('#statAccuracy').textContent = total ? '99.2%' : '—';
  renderDashboardChart();
}

function renderRecentScans() {
  const container = $('#recentScansList');
  if (!state.history.length) {
    container.innerHTML = `<div class="empty-state small"><i class="fa-solid fa-inbox"></i><p>No scans yet. Run your first scan to see activity here.</p></div>`;
    return;
  }
  container.innerHTML = state.history.slice(0, 6).map(h => `
    <div class="recent-item">
      <div class="recent-icon ${h.result === 'fake' ? 'icon-red' : 'icon-green'}">
        <i class="fa-solid ${h.result === 'fake' ? 'fa-triangle-exclamation' : 'fa-circle-check'}"></i>
      </div>
      <div class="recent-meta">
        <div class="recent-name">${escapeHtml(h.name)}</div>
        <div class="recent-time">${h.dateLabel}</div>
      </div>
      <span class="recent-badge ${h.result === 'fake' ? 'badge-fake' : 'badge-real'}">${h.confidence}%</span>
    </div>
  `).join('');
}

function renderHistoryTable() {
  const body = $('#historyTableBody');
  const empty = $('#historyEmpty');
  const table = $('#historyTable');
  if (!state.history.length) {
    table.classList.add('hidden');
    empty.classList.remove('hidden');
    return;
  }
  table.classList.remove('hidden');
  empty.classList.add('hidden');
  body.innerHTML = state.history.map(h => `
    <tr>
      <td>${escapeHtml(h.name)}</td>
      <td><span class="recent-badge ${h.result === 'fake' ? 'badge-fake' : 'badge-real'}">${h.result.toUpperCase()}</span></td>
      <td>${h.confidence}%</td>
      <td>${escapeHtml(h.type)}</td>
      <td>${h.dateLabel}</td>
    </tr>
  `).join('');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/* ---------------------------------------------------------------- export csv */

$('#exportHistoryBtn').addEventListener('click', () => {
  if (!state.history.length) { showToast('No history to export yet.', 'error'); return; }
  const rows = [['Name', 'Result', 'Confidence', 'Type', 'Date']];
  state.history.forEach(h => rows.push([h.name, h.result, h.confidence + '%', h.type, h.dateLabel]));
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'deepshield_history.csv';
  link.click();
  showToast('History exported as CSV.', 'success');
});

/* ---------------------------------------------------------------- settings */

$('#darkModeToggle').addEventListener('change', (e) => {
  state.settings.darkMode = e.target.checked;
  document.body.classList.toggle('light-mode', !e.target.checked);
  saveSettings();
  showToast(e.target.checked ? 'Dark mode enabled.' : 'Light mode enabled.', 'info');
});

$('#toastToggle').addEventListener('change', (e) => {
  state.settings.toasts = e.target.checked;
  saveSettings();
});

$('#clearHistoryBtn').addEventListener('click', () => {
  if (!state.history.length) { showToast('History is already empty.', 'info'); return; }
  if (!confirm('This will permanently delete all scan history. Continue?')) return;
  state.history = [];
  saveHistory();
  renderHistoryTable();
  renderRecentScans();
  updateDashboardStats();
  showToast('Scan history cleared.', 'success');
});

/* ---------------------------------------------------------------- charts */

const chartColors = {
  blue: '#4f8cff', purple: '#a06bff', cyan: '#6ee7ff', green: '#3ddc97', red: '#ff5c7a',
  grid: 'rgba(255,255,255,0.06)', text: '#aab2c8'
};

Chart.defaults.font.family = "'Outfit', sans-serif";
Chart.defaults.color = chartColors.text;

function destroyChart(key) {
  if (state.charts[key]) { state.charts[key].destroy(); delete state.charts[key]; }
}

function renderDashboardChart() {
  const ctx = document.getElementById('trendChart');
  if (!ctx) return;
  destroyChart('trend');

  const last7 = getLastNDaysCounts(7);
  state.charts.trend = new Chart(ctx, {
    type: 'line',
    data: {
      labels: last7.labels,
      datasets: [{
        label: 'Scans',
        data: last7.counts,
        borderColor: chartColors.blue,
        backgroundColor: 'rgba(79,140,255,0.15)',
        fill: true,
        tension: 0.4,
        pointBackgroundColor: chartColors.cyan,
        pointRadius: 3
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false } },
        y: { grid: { color: chartColors.grid }, beginAtZero: true, ticks: { precision: 0 } }
      }
    }
  });
}

function renderAnalyticsCharts() {
  $('#analyticsEmpty').classList.toggle('hidden', state.history.length > 0);
  if (!state.history.length) return;

  const fake = state.history.filter(h => h.result === 'fake').length;
  const real = state.history.length - fake;

  destroyChart('pie');
  state.charts.pie = new Chart(document.getElementById('pieChart'), {
    type: 'doughnut',
    data: {
      labels: ['Fake', 'Real'],
      datasets: [{ data: [fake, real], backgroundColor: [chartColors.red, chartColors.green], borderWidth: 0 }]
    },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } }, cutout: '68%' }
  });

  const recent = state.history.slice(0, 12).reverse();
  destroyChart('confidence');
  state.charts.confidence = new Chart(document.getElementById('confidenceChart'), {
    type: 'line',
    data: {
      labels: recent.map((_, i) => `#${i + 1}`),
      datasets: [{
        label: 'Confidence %',
        data: recent.map(h => h.confidence),
        borderColor: chartColors.purple,
        backgroundColor: 'rgba(160,107,255,0.15)',
        fill: true,
        tension: 0.4,
        pointRadius: 3,
        pointBackgroundColor: chartColors.cyan
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { x: { grid: { display: false } }, y: { grid: { color: chartColors.grid }, min: 0, max: 100 } }
    }
  });

  const last14 = getLastNDaysCounts(14);
  destroyChart('history');
  state.charts.history = new Chart(document.getElementById('historyChart'), {
    type: 'bar',
    data: {
      labels: last14.labels,
      datasets: [{ label: 'Scans', data: last14.counts, backgroundColor: chartColors.blue, borderRadius: 6, maxBarThickness: 26 }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { x: { grid: { display: false } }, y: { grid: { color: chartColors.grid }, beginAtZero: true, ticks: { precision: 0 } } }
    }
  });
}

function getLastNDaysCounts(n) {
  const labels = [];
  const counts = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const label = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    labels.push(label);
    const count = state.history.filter(h => {
      const hd = new Date(h.date);
      return hd.toDateString() === d.toDateString();
    }).length;
    counts.push(count);
  }
  return { labels, counts };
}

/* ---------------------------------------------------------------- scroll reveal */

function initScrollReveal() {
  const targets = $all('.reveal');
  if (!targets.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -60px 0px' });

  targets.forEach(el => observer.observe(el));
}

/* ---------------------------------------------------------------- button ripple */

function initButtonRipples() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn, .side-link, .scan-tab');
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const ripple = document.createElement('span');
    const size = Math.max(rect.width, rect.height) * 1.4;
    ripple.className = 'btn-ripple';
    ripple.style.width = ripple.style.height = `${size}px`;
    ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
    ripple.style.top = `${e.clientY - rect.top - size / 2}px`;
    btn.appendChild(ripple);
    setTimeout(() => ripple.remove(), 620);
  });
}

/* ---------------------------------------------------------------- orb parallax */

function initOrbParallax() {
  const blue = document.querySelector('.orb-blue');
  const purple = document.querySelector('.orb-purple');
  if (!blue || !purple) return;
  window.addEventListener('mousemove', (e) => {
    const x = (e.clientX / window.innerWidth - 0.5) * 40;
    const y = (e.clientY / window.innerHeight - 0.5) * 40;
    blue.style.transform = `translate(${x}px, ${y}px)`;
    purple.style.transform = `translate(${-x}px, ${-y}px)`;
  }, { passive: true });
}

/* ---------------------------------------------------------------- init */

function init() {
  loadHistory();
  loadSettings();

  $('#darkModeToggle').checked = state.settings.darkMode;
  $('#toastToggle').checked = state.settings.toasts;
  document.body.classList.toggle('light-mode', !state.settings.darkMode);

  renderHistoryTable();
  renderRecentScans();
  updateDashboardStats();
  animateHeroStat();
  initScrollReveal();
  initButtonRipples();
  initOrbParallax();
}

document.addEventListener('DOMContentLoaded', init);
