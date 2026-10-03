// Dashboard Client Logic - Simple IoT World

let currentUser = null;
let currentToken = null;
let sensorChart = null;
let chartViewMode = 'both'; // 'both', 'temp', 'hum'

// Pagination state
let currentPage = 1;
let pageSize = 10;
let totalPages = 1;
let totalRecords = 0;

// LED & LCD local cache
let currentLedState = false;
let currentLcdLine1 = 'SMART DISPLAY';
let currentLcdLine2 = 'MyData';

// Temperature & Humidity Min/Max tracker
let tempMax = -Infinity;
let tempMin = Infinity;
let humMax = -Infinity;
let humMin = Infinity;

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Verify Auth
  const authOk = await verifyAuth();
  if (!authOk) return;

  // 2. Initialize UI Components
  initThemeToggle();
  initTabs();
  initChart();
  initLcdControls();
  initLedControls();
  initTableControls();
  initLogout();

  // 3. Initial Data Fetch
  await fetchLatestTelemetry();
  await fetchChartData();
  await fetchRecordsTable(currentPage);
  await fetchDeviceState();

  // 4. Start Real-Time Polling Loop (Every 2.5s)
  setInterval(async () => {
    await fetchLatestTelemetry();
    await fetchDeviceState();
  }, 2500);

  // Poll Chart Data periodically (Every 10s)
  setInterval(async () => {
    await fetchChartData();
  }, 10000);
});

// ================= AUTHENTICATION ================= //
async function verifyAuth() {
  currentToken = localStorage.getItem('iot_token');
  const storedUser = localStorage.getItem('iot_user');

  if (!currentToken) {
    window.location.href = '/';
    return false;
  }

  try {
    const res = await fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });

    if (!res.ok) {
      localStorage.removeItem('iot_token');
      localStorage.removeItem('iot_user');
      window.location.href = '/';
      return false;
    }

    const data = await res.json();
    if (data.success && data.user) {
      currentUser = data.user;
      const userNameSpan = document.getElementById('userNameSpan');
      if (userNameSpan) {
        userNameSpan.textContent = currentUser.name || 'Pranav';
      }
      return true;
    } else {
      window.location.href = '/';
      return false;
    }
  } catch (err) {
    console.warn('Network issue verifying auth token:', err);
    if (storedUser) {
      try {
        currentUser = JSON.parse(storedUser);
        const userNameSpan = document.getElementById('userNameSpan');
        if (userNameSpan) userNameSpan.textContent = currentUser.name || 'Pranav';
        return true;
      } catch (e) {}
    }
    return true;
  }
}

function initLogout() {
  const logoutBtn = document.getElementById('logoutBtn');
  logoutBtn?.addEventListener('click', async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {}
    localStorage.removeItem('iot_token');
    localStorage.removeItem('iot_user');
    showToast('Logged out successfully', 'info');
    setTimeout(() => {
      window.location.href = '/';
    }, 500);
  });
}

// ================= TAB NAVIGATION ================= //
function initTabs() {
  const tabs = [
    { btn: document.getElementById('navTab1'), pane: document.getElementById('tabContent1') },
    { btn: document.getElementById('navTab2'), pane: document.getElementById('tabContent2') },
    { btn: document.getElementById('navTab3'), pane: document.getElementById('tabContent3') }
  ];

  tabs.forEach((tab, index) => {
    tab.btn?.addEventListener('click', () => {
      tabs.forEach(t => {
        t.pane.classList.remove('active');
        t.btn.className = 'tab-btn inline-flex items-center space-x-2 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all duration-200 text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-950/30';
      });

      tab.pane.classList.add('active');
      tab.btn.className = 'tab-btn inline-flex items-center space-x-2 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all duration-200 bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-md shadow-blue-500/25';

      // Trigger resize for chart if switching to tab 1
      if (index === 0 && sensorChart) {
        setTimeout(() => sensorChart.resize(), 50);
      }
    });
  });
}

// ================= TELEMETRY & DEVICE STATUS ================= //
async function fetchLatestTelemetry() {
  try {
    const res = await fetch('/api/sensor-data/latest');
    if (!res.ok) return;

    const json = await res.json();
    if (!json.success) return;

    const data = json.data;
    const online = json.online;

    // Update Online / Offline Badge
    updateDeviceOnlineStatus(online, json.lastSeen);

    if (data && data.temperature !== undefined) {
      const temp = parseFloat(data.temperature);
      const hum = parseFloat(data.humidity);

      // Temperature Card
      document.getElementById('liveTempValue').textContent = isNaN(temp) ? '--.-' : temp.toFixed(1);
      
      // Temp Seek bar (0 to 50 C)
      const tempPercent = Math.min(Math.max((temp / 50) * 100, 0), 100);
      document.getElementById('tempSeekPercent').textContent = `${Math.round(tempPercent)}%`;
      document.getElementById('tempProgressBar').style.width = `${tempPercent}%`;

      // Temp Status Badge
      const tempBadge = document.getElementById('tempStatusBadge');
      if (temp < 18) {
        tempBadge.textContent = 'Cool';
        tempBadge.className = 'text-xs font-bold px-3 py-1 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300';
      } else if (temp <= 32) {
        tempBadge.textContent = 'Optimal';
        tempBadge.className = 'text-xs font-bold px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300';
      } else if (temp <= 38) {
        tempBadge.textContent = 'Warm';
        tempBadge.className = 'text-xs font-bold px-3 py-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300';
      } else {
        tempBadge.textContent = 'Hot';
        tempBadge.className = 'text-xs font-bold px-3 py-1 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300';
      }

      // Min/Max calculations
      if (!isNaN(temp)) {
        if (temp > tempMax) tempMax = temp;
        if (temp < tempMin) tempMin = temp;
        document.getElementById('tempMaxToday').textContent = `${tempMax.toFixed(1)} °C`;
        document.getElementById('tempMinToday').textContent = `${tempMin.toFixed(1)} °C`;
      }

      // Humidity Card
      document.getElementById('liveHumValue').textContent = isNaN(hum) ? '--' : Math.round(hum);
      
      // Hum Seek bar (0 to 100%)
      const humPercent = Math.min(Math.max(hum, 0), 100);
      document.getElementById('humSeekPercent').textContent = `${Math.round(humPercent)}%`;
      document.getElementById('humProgressBar').style.width = `${humPercent}%`;

      // Hum Status Badge
      const humBadge = document.getElementById('humStatusBadge');
      if (hum < 30) {
        humBadge.textContent = 'Dry Air';
        humBadge.className = 'text-xs font-bold px-3 py-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300';
      } else if (hum <= 60) {
        humBadge.textContent = 'Comfortable';
        humBadge.className = 'text-xs font-bold px-3 py-1 rounded-full bg-cyan-100 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300';
      } else {
        humBadge.textContent = 'Humid';
        humBadge.className = 'text-xs font-bold px-3 py-1 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300';
      }

      if (!isNaN(hum)) {
        if (hum > humMax) humMax = hum;
        if (hum < humMin) humMin = hum;
        document.getElementById('humMaxToday').textContent = `${Math.round(humMax)} %`;
        document.getElementById('humMinToday').textContent = `${Math.round(humMin)} %`;
      }

      // Last updated string
      if (data.time) {
        document.getElementById('lastUpdatedTimeText').textContent = `${data.time} (IST)`;
      }
    }
  } catch (err) {
    console.error('Error fetching telemetry:', err);
  }
}

function updateDeviceOnlineStatus(online, lastSeen) {
  const badge = document.getElementById('deviceStatusBadge');
  const ping = document.getElementById('statusPing');
  const dot = document.getElementById('statusDot');
  const text = document.getElementById('statusText');

  if (online) {
    badge.className = 'flex items-center space-x-2 px-3 sm:px-3.5 py-1.5 rounded-full text-xs font-bold border transition-all duration-300 bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/70 dark:text-emerald-300 dark:border-emerald-800 shadow-sm shadow-emerald-500/20';
    ping.className = 'absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 ping-pulse';
    ping.classList.remove('hidden');
    dot.className = 'relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500';
    text.textContent = 'ESP8266: ONLINE';
  } else {
    badge.className = 'flex items-center space-x-2 px-3 sm:px-3.5 py-1.5 rounded-full text-xs font-bold border transition-all duration-300 bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-400 dark:border-blue-900';
    ping.classList.add('hidden');
    dot.className = 'relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500';
    text.textContent = 'ESP8266: OFFLINE';
  }
}

// ================= CHART.JS GRAPHS ================= //
function initChart() {
  const ctx = document.getElementById('sensorChart')?.getContext('2d');
  if (!ctx) return;

  const isDark = document.documentElement.classList.contains('dark');
  const textColor = isDark ? '#94a3b8' : '#64748b';
  const gridColor = isDark ? 'rgba(51, 65, 85, 0.4)' : 'rgba(226, 232, 240, 0.8)';

  sensorChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Temperature (°C)',
          data: [],
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(239, 68, 68, 0.15)',
          borderWidth: 2.5,
          tension: 0.35,
          fill: true,
          pointBackgroundColor: '#3b82f6',
          pointRadius: 3,
          pointHoverRadius: 6,
          yAxisID: 'y'
        },
        {
          label: 'Humidity (%)',
          data: [],
          borderColor: '#0284c7',
          backgroundColor: 'rgba(2, 132, 199, 0.15)',
          borderWidth: 2.5,
          tension: 0.35,
          fill: true,
          pointBackgroundColor: '#0284c7',
          pointRadius: 3,
          pointHoverRadius: 6,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            color: textColor,
            font: { family: "'Plus Jakarta Sans', sans-serif", weight: 'bold', size: 12 },
            usePointStyle: true,
            boxWidth: 8
          }
        },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.9)',
          titleFont: { family: "'Plus Jakarta Sans', sans-serif", weight: 'bold' },
          bodyFont: { family: "'Plus Jakarta Sans', sans-serif" },
          padding: 10,
          cornerRadius: 8
        }
      },
      scales: {
        x: {
          grid: { color: gridColor },
          ticks: { color: textColor, font: { size: 10 }, maxRotation: 45 }
        },
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          title: { display: true, text: 'Temperature (°C)', color: '#3b82f6', font: { weight: 'bold', size: 11 } },
          grid: { color: gridColor },
          ticks: { color: textColor },
          min: 0,
          max: 50
        },
        y1: {
          type: 'linear',
          display: true,
          position: 'right',
          title: { display: true, text: 'Humidity (%)', color: '#0284c7', font: { weight: 'bold', size: 11 } },
          grid: { drawOnChartArea: false },
          ticks: { color: textColor },
          min: 0,
          max: 100
        }
      }
    }
  });

  // Chart View Toggle buttons
  const btnBoth = document.getElementById('chartViewBoth');
  const btnTemp = document.getElementById('chartViewTemp');
  const btnHum = document.getElementById('chartViewHum');

  function updateChartButtons(activeBtn) {
    [btnBoth, btnTemp, btnHum].forEach(b => {
      b.className = 'px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-blue-500';
    });
    activeBtn.className = 'px-3 py-1.5 rounded-lg text-xs font-bold bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-sm';
  }

  btnBoth?.addEventListener('click', () => {
    chartViewMode = 'both';
    updateChartButtons(btnBoth);
    sensorChart.data.datasets[0].hidden = false;
    sensorChart.data.datasets[1].hidden = false;
    sensorChart.options.scales.y.display = true;
    sensorChart.options.scales.y1.display = true;
    sensorChart.update();
  });

  btnTemp?.addEventListener('click', () => {
    chartViewMode = 'temp';
    updateChartButtons(btnTemp);
    sensorChart.data.datasets[0].hidden = false;
    sensorChart.data.datasets[1].hidden = true;
    sensorChart.options.scales.y.display = true;
    sensorChart.options.scales.y1.display = false;
    sensorChart.update();
  });

  btnHum?.addEventListener('click', () => {
    chartViewMode = 'hum';
    updateChartButtons(btnHum);
    sensorChart.data.datasets[0].hidden = true;
    sensorChart.data.datasets[1].hidden = false;
    sensorChart.options.scales.y.display = false;
    sensorChart.options.scales.y1.display = true;
    sensorChart.update();
  });
}

async function fetchChartData() {
  if (!sensorChart) return;
  try {
    const res = await fetch('/api/sensor-data/chart?count=20');
    if (!res.ok) return;
    const json = await res.json();
    if (json.success && Array.isArray(json.data)) {
      const labels = json.data.map(d => d.time || '');
      const temps = json.data.map(d => d.temperature);
      const hums = json.data.map(d => d.humidity);

      sensorChart.data.labels = labels;
      sensorChart.data.datasets[0].data = temps;
      sensorChart.data.datasets[1].data = hums;
      sensorChart.update('none'); // smooth update without animation flash
    }
  } catch (err) {
    console.error('Error fetching chart data:', err);
  }
}

// ================= SAVED RECORDS TABLE & PAGINATION ================= //
function initTableControls() {
  const pageSizeSelect = document.getElementById('pageSizeSelect');
  pageSizeSelect?.addEventListener('change', (e) => {
    pageSize = parseInt(e.target.value) || 10;
    currentPage = 1;
    fetchRecordsTable(currentPage);
  });

  document.getElementById('prevPageBtn')?.addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      fetchRecordsTable(currentPage);
    }
  });

  document.getElementById('nextPageBtn')?.addEventListener('click', () => {
    if (currentPage < totalPages) {
      currentPage++;
      fetchRecordsTable(currentPage);
    }
  });

  document.getElementById('refreshTableBtn')?.addEventListener('click', () => {
    fetchRecordsTable(currentPage);
    showToast('Records refreshed', 'info');
  });

  document.getElementById('exportCsvBtn')?.addEventListener('click', exportRecordsCsv);
}

async function fetchRecordsTable(page = 1) {
  const tbody = document.getElementById('recordsTableBody');
  if (!tbody) return;

  try {
    const res = await fetch(`/api/sensor-data/history?page=${page}&limit=${pageSize}&sort=desc`);
    if (!res.ok) return;
    const json = await res.json();

    if (!json.success || !Array.isArray(json.data)) {
      tbody.innerHTML = `<tr><td colspan="6" class="py-6 text-center text-slate-400">No records found</td></tr>`;
      return;
    }

    const records = json.data;
    const pagination = json.pagination;
    totalRecords = pagination.total;
    totalPages = pagination.totalPages;
    currentPage = pagination.page;

    // Update Pagination Summary Text
    const startNum = totalRecords === 0 ? 0 : (currentPage - 1) * pageSize + 1;
    const endNum = Math.min(currentPage * pageSize, totalRecords);
    document.getElementById('recordsCountText').textContent = `Showing ${startNum}-${endNum} of ${totalRecords} records`;

    // Update Prev / Next Buttons
    document.getElementById('prevPageBtn').disabled = currentPage <= 1;
    document.getElementById('nextPageBtn').disabled = currentPage >= totalPages;

    // Render Page Number Buttons
    renderPageButtons();

    // Render Table Rows
    if (records.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="py-8 text-center text-slate-400 font-medium">No telemetry records saved yet. Connect ESP8266 to start receiving data.</td></tr>`;
      return;
    }

    tbody.innerHTML = records.map((rec, index) => {
      const rowNumber = (currentPage - 1) * pageSize + index + 1;
      return `
        <tr class="hover:bg-slate-500/5 transition-colors">
          <td class="py-3.5 px-4 text-center font-mono font-bold text-slate-500">${rowNumber}</td>
          <td class="py-3.5 px-4 font-bold text-blue-600 dark:text-blue-400">${rec.temperature} °C</td>
          <td class="py-3.5 px-4 font-bold text-blue-600 dark:text-blue-400">${rec.humidity}%</td>
          <td class="py-3.5 px-4 font-mono text-slate-700 dark:text-slate-300">${rec.time || '--:--'}</td>
          <td class="py-3.5 px-4 font-mono text-slate-700 dark:text-slate-300">${rec.date || '--'}</td>
          <td class="py-3.5 px-4 text-center">
            <button onclick="deleteRecord('${rec.id}')" class="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50 transition-colors" title="Delete Record">
              <i class="fa-solid fa-trash-can text-sm"></i>
            </button>
          </td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    console.error('Error fetching records table:', err);
    tbody.innerHTML = `<tr><td colspan="6" class="py-6 text-center text-blue-500">Failed to load records.</td></tr>`;
  }
}

function renderPageButtons() {
  const container = document.getElementById('pageNumberButtons');
  if (!container) return;

  container.innerHTML = '';
  const maxButtons = 5;
  let start = Math.max(1, currentPage - 2);
  let end = Math.min(totalPages, start + maxButtons - 1);

  if (end - start < maxButtons - 1) {
    start = Math.max(1, end - maxButtons + 1);
  }

  for (let i = start; i <= end; i++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = i;
    if (i === currentPage) {
      btn.className = 'w-7 h-7 rounded-lg text-xs font-bold bg-blue-600 text-white shadow-sm';
    } else {
      btn.className = 'w-7 h-7 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors';
    }
    btn.addEventListener('click', () => {
      currentPage = i;
      fetchRecordsTable(currentPage);
    });
    container.appendChild(btn);
  }
}

// Global function to delete record
window.deleteRecord = async function(id) {
  if (!confirm('Are you sure you want to delete this sensor record?')) return;

  try {
    const res = await fetch(`/api/sensor-data/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (res.ok && data.success) {
      showToast('Record deleted', 'success');
      await fetchRecordsTable(currentPage);
      await fetchChartData();
    } else {
      showToast(data.message || 'Could not delete record', 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Network error while deleting', 'error');
  }
};

// Export to CSV
async function exportRecordsCsv() {
  try {
    const res = await fetch('/api/sensor-data/history?limit=1000&sort=desc');
    const json = await res.json();
    if (!json.success || !json.data.length) {
      showToast('No records available to export', 'info');
      return;
    }

    const headers = ['#', 'Temperature (deg C)', 'Humidity (%)', 'Time (IST)', 'Date (IST)'];
    const rows = json.data.map((r, i) => [
      i + 1,
      r.temperature,
      r.humidity,
      `"${r.time}"`,
      `"${r.date}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `SimpleIoTWorld_Records_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('CSV downloaded successfully', 'success');
  } catch (e) {
    showToast('Failed to export CSV', 'error');
  }
}

// ================= TAB 2: LCD SMART DISPLAY ================= //
function initLcdControls() {
  const line1Input = document.getElementById('lcdLine1Input');
  const line2Input = document.getElementById('lcdLine2Input');
  const charCount1 = document.getElementById('charCount1');
  const charCount2 = document.getElementById('charCount2');
  const previewLine1 = document.getElementById('lcdPreviewLine1');
  const previewLine2 = document.getElementById('lcdPreviewLine2');
  const lcdForm = document.getElementById('lcdForm');

  function updateLcdPreview() {
    const l1 = (line1Input.value || '                ').padEnd(16, ' ').slice(0, 16);
    const l2 = (line2Input.value || '                ').padEnd(16, ' ').slice(0, 16);
    previewLine1.textContent = l1;
    previewLine2.textContent = l2;
    charCount1.textContent = `${line1Input.value.length} / 16`;
    charCount2.textContent = `${line2Input.value.length} / 16`;
  }

  line1Input?.addEventListener('input', updateLcdPreview);
  line2Input?.addEventListener('input', updateLcdPreview);

  lcdForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('saveLcdBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Saving to Cloud...';

    const line1 = line1Input.value.slice(0, 16);
    const line2 = line2Input.value.slice(0, 16);

    try {
      const res = await fetch('/api/device/lcd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ line1, line2 })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        currentLcdLine1 = data.lcdLine1;
        currentLcdLine2 = data.lcdLine2;
        document.getElementById('savedLine1Label').textContent = currentLcdLine1;
        document.getElementById('savedLine2Label').textContent = currentLcdLine2;
        showToast('LCD text saved! ESP8266 will display this on next cycle.', 'success');
      } else {
        showToast('Failed to update LCD', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Network error saving LCD', 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up mr-2"></i> Save & Display on LCD';
    }
  });
}

// ================= TAB 3: LED ACTUATOR CONTROL ================= //
function initLedControls() {
  const switchBtn = document.getElementById('ledToggleSwitchBtn');
  switchBtn?.addEventListener('click', async () => {
    const newState = !currentLedState;
    await setLedState(newState);
  });
}

async function setLedState(state) {
  try {
    const res = await fetch('/api/device/led', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      currentLedState = data.ledState;
      updateLedUI(currentLedState);
      showToast(`LED hardware turned ${currentLedState ? 'ON' : 'OFF'}!`, 'success');
    }
  } catch (err) {
    console.error(err);
    showToast('Failed to update LED state', 'error');
  }
}

function updateLedUI(isOn) {
  const switchBtn = document.getElementById('ledToggleSwitchBtn');
  const bulb = document.getElementById('virtualLedBulb');
  const badge = document.getElementById('ledStatusBadge');
  const badgeDot = document.getElementById('ledBadgeDot');
  const statusText = document.getElementById('ledStatusText');

  if (isOn) {
    switchBtn?.classList.add('active');
    bulb?.classList.add('on');
    if (badge) {
      badge.className = 'inline-flex items-center space-x-2 px-5 py-2 rounded-full border text-sm font-extrabold bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-950/80 dark:text-blue-300 dark:border-blue-800 shadow-lg shadow-blue-500/20';
    }
    if (badgeDot) badgeDot.className = 'w-3 h-3 rounded-full bg-blue-500 animate-pulse';
    if (statusText) statusText.textContent = 'LED IS TURNED ON';
  } else {
    switchBtn?.classList.remove('active');
    bulb?.classList.remove('on');
    if (badge) {
      badge.className = 'inline-flex items-center space-x-2 px-5 py-2 rounded-full border text-sm font-extrabold bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800/80 dark:text-slate-400 dark:border-slate-700';
    }
    if (badgeDot) badgeDot.className = 'w-3 h-3 rounded-full bg-slate-400';
    if (statusText) statusText.textContent = 'LED IS TURNED OFF';
  }
}

// Fetch device state (LCD & LED) from server
async function fetchDeviceState() {
  try {
    const res = await fetch('/api/device/state');
    if (!res.ok) return;
    const json = await res.json();
    if (json.success) {
      currentLedState = Boolean(json.ledState);
      updateLedUI(currentLedState);

      if (json.lcdLine1 !== undefined && json.lcdLine2 !== undefined) {
        currentLcdLine1 = json.lcdLine1;
        currentLcdLine2 = json.lcdLine2;
        const saved1 = document.getElementById('savedLine1Label');
        const saved2 = document.getElementById('savedLine2Label');
        if (saved1) saved1.textContent = currentLcdLine1;
        if (saved2) saved2.textContent = currentLcdLine2;

        // Set inputs if empty
        const in1 = document.getElementById('lcdLine1Input');
        const in2 = document.getElementById('lcdLine2Input');
        if (in1 && !in1.value) in1.value = currentLcdLine1;
        if (in2 && !in2.value) in2.value = currentLcdLine2;

        const p1 = document.getElementById('lcdPreviewLine1');
        const p2 = document.getElementById('lcdPreviewLine2');
        if (p1) p1.textContent = (currentLcdLine1 || '').padEnd(16, ' ').slice(0, 16);
        if (p2) p2.textContent = (currentLcdLine2 || '').padEnd(16, ' ').slice(0, 16);
      }
    }
  } catch (err) {
    console.error('Error fetching device state:', err);
  }
}

// ================= THEME TOGGLE ================= //
function initThemeToggle() {
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  const themeIcon = document.getElementById('themeIcon');

  function updateIcon() {
    const isDark = document.documentElement.classList.contains('dark');
    if (themeIcon) {
      if (isDark) {
        themeIcon.className = 'fa-solid fa-sun text-lg text-amber-400';
      } else {
        themeIcon.className = 'fa-solid fa-moon text-lg text-slate-700';
      }
    }
  }

  updateIcon();

  themeToggleBtn?.addEventListener('click', () => {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    updateIcon();

    // Re-render chart with correct theme grid colors
    if (sensorChart) {
      const textColor = isDark ? '#94a3b8' : '#64748b';
      const gridColor = isDark ? 'rgba(51, 65, 85, 0.4)' : 'rgba(226, 232, 240, 0.8)';
      sensorChart.options.scales.x.grid.color = gridColor;
      sensorChart.options.scales.x.ticks.color = textColor;
      sensorChart.options.scales.y.grid.color = gridColor;
      sensorChart.options.scales.y.ticks.color = textColor;
      sensorChart.options.plugins.legend.labels.color = textColor;
      sensorChart.update();
    }
  });
}

// ================= TOAST NOTIFICATIONS ================= //
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'pointer-events-auto flex items-center space-x-3 px-4 py-3 rounded-2xl shadow-xl border text-sm font-semibold transition-all duration-300 transform translate-x-full';

  let icon = 'fa-circle-info';
  if (type === 'success') {
    toast.classList.add('bg-emerald-600', 'text-white', 'border-emerald-500');
    icon = 'fa-circle-check';
  } else if (type === 'error') {
    toast.classList.add('bg-blue-600', 'text-white', 'border-blue-500');
    icon = 'fa-triangle-exclamation';
  } else {
    toast.classList.add('bg-slate-900', 'text-white', 'border-slate-700');
    icon = 'fa-circle-info';
  }

  toast.innerHTML = `<i class="fa-solid ${icon} text-base"></i><span>${message}</span>`;
  container.appendChild(toast);

  // Trigger animation
  setTimeout(() => {
    toast.classList.remove('translate-x-full');
  }, 10);

  // Remove toast after 3.5s
  setTimeout(() => {
    toast.classList.add('translate-x-full', 'opacity-0');
    setTimeout(() => {
      container.removeChild(toast);
    }, 300);
  }, 3500);
}
