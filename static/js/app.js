let balanceChartInstance = null;
let cycleChartInstance = null;
let allTradesData = [];
let currentFilter = 'all';

// Current session state
let currentUser = {
    token: localStorage.getItem('tracker_token') || null,
    role: localStorage.getItem('tracker_role') || 'user',
    displayName: localStorage.getItem('tracker_name') || 'Viewer',
    username: localStorage.getItem('tracker_uname') || 'user'
};

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
    setDefaultDateTime();
    renderAuthUI();
    fetchTrades();
    verifyAuth();
});

// Helper: Get Auth headers
function getAuthHeaders() {
    const headers = {};
    if (currentUser.token) {
        headers['Authorization'] = `Bearer ${currentUser.token}`;
    }
    return headers;
}

// Check session validity with backend
async function verifyAuth() {
    if (!currentUser.token) {
        setViewerState();
        return;
    }
    try {
        const res = await fetch('/api/me', { headers: getAuthHeaders() });
        const data = await res.json();
        if (data.authenticated) {
            currentUser.role = data.role;
            currentUser.displayName = data.displayName;
            currentUser.username = data.username;
            localStorage.setItem('tracker_role', data.role);
            localStorage.setItem('tracker_name', data.displayName);
            localStorage.setItem('tracker_uname', data.username);
        } else {
            setViewerState();
        }
    } catch (e) {
        console.warn('Auth verify skipped:', e);
    }
    renderAuthUI();
}

function setViewerState() {
    currentUser.token = null;
    currentUser.role = 'user';
    currentUser.displayName = 'Viewer';
    currentUser.username = 'user';
    localStorage.removeItem('tracker_token');
    localStorage.setItem('tracker_role', 'user');
    localStorage.setItem('tracker_name', 'Viewer');
}

// Render role-based UI (Admin vs Viewer)
function renderAuthUI() {
    const userContainer = document.getElementById('userBadgeContainer');
    const adminElements = document.querySelectorAll('.admin-only');
    const viewerBanner = document.getElementById('viewerBanner');
    const footerRole = document.getElementById('footerRole');

    if (footerRole) footerRole.textContent = currentUser.displayName;

    if (currentUser.role === 'admin') {
        // Admin controls visible
        adminElements.forEach(el => el.classList.remove('hidden'));
        if (viewerBanner) viewerBanner.classList.add('hidden');

        if (userContainer) {
            userContainer.innerHTML = `
                <div class="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-xl text-xs font-bold text-amber-300">
                    <span>👑</span>
                    <span class="hidden sm:inline">${currentUser.displayName}</span>
                </div>
                <button onclick="logout()" title="Log out" class="p-2 rounded-xl bg-slate-900 border border-slate-700/80 hover:text-red-400 text-slate-400 text-xs transition">
                    <i class="fa-solid fa-arrow-right-from-bracket"></i>
                </button>
            `;
        }
    } else {
        // Viewer mode: hide admin controls
        adminElements.forEach(el => el.classList.add('hidden'));
        if (viewerBanner) viewerBanner.classList.remove('hidden');

        if (userContainer) {
            userContainer.innerHTML = `
                <div class="flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 px-3 py-1.5 rounded-xl text-xs font-semibold text-blue-400">
                    <i class="fa-solid fa-eye"></i>
                    <span class="hidden sm:inline">Viewer</span>
                </div>
                <button onclick="openLoginModal()" class="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs border border-slate-700 transition flex items-center gap-1.5 shadow-sm">
                    <i class="fa-solid fa-lock text-amber-400"></i>
                    <span>Admin Login</span>
                </button>
            `;
        }
    }

    // Re-render table to display or hide edit/delete buttons
    renderTradesTable(allTradesData);
}

// Format ISO date to local datetime-local string
function setDefaultDateTime() {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    const formatted = now.toISOString().slice(0, 16);
    const dateInput = document.getElementById('inputDate');
    if (dateInput) dateInput.value = formatted;
}

// Fetch all trades and stats
async function fetchTrades() {
    try {
        const res = await fetch('/api/trades');
        if (!res.ok) throw new Error('Failed to fetch trades');
        const data = await res.json();
        allTradesData = data.trades || [];
        
        updateDashboard(data);
        renderCharts(data.balance_history, data.stats);
        renderTradesTable(allTradesData);
    } catch (err) {
        console.error('Error loading trades:', err);
        showToast('Error loading trades: ' + err.message, 'error');
    }
}

// Update DOM elements with calculated stats
function updateDashboard(data) {
    const stats = data.stats;
    const initial = stats.initial_balance || 10.0;
    const target = stats.target_balance || 100.0;
    const current = stats.current_balance || 10.0;

    // Balance & Gain
    const displayBalance = document.getElementById('displayBalance');
    if (displayBalance) displayBalance.textContent = `$${current.toFixed(2)}`;

    const gainPct = (((current - initial) / initial) * 100).toFixed(1);
    const gainBadge = document.getElementById('gainBadge');
    if (gainBadge) {
        const sign = current >= initial ? '+' : '';
        gainBadge.textContent = `${sign}${gainPct}%`;
        gainBadge.className = current >= initial 
            ? 'text-xs font-bold font-mono-data px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
            : 'text-xs font-bold font-mono-data px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20';
    }

    const remaining = Math.max(0, target - current);
    const remainingEl = document.getElementById('remainingAmount');
    if (remainingEl) remainingEl.textContent = `$${remaining.toFixed(2)}`;

    // Progress Bar
    const progressPct = stats.progress_pct || 0;
    const progressBar = document.getElementById('progressBar');
    if (progressBar) progressBar.style.width = `${Math.min(100, progressPct)}%`;

    const progressPctText = document.getElementById('progressPctText');
    if (progressPctText) progressPctText.textContent = `${progressPct}% Completed`;

    // Daily Setup Counter
    const todayCount = stats.today_setups || 0;
    const todayCountEl = document.getElementById('todayCount');
    if (todayCountEl) todayCountEl.textContent = todayCount;

    const pill1 = document.getElementById('pill1');
    const pill2 = document.getElementById('pill2');
    if (pill1 && pill2) {
        pill1.className = todayCount >= 1 
            ? 'w-4 h-9 rounded-lg bg-blue-500 shadow-lg shadow-blue-500/40 border border-blue-400' 
            : 'w-4 h-9 rounded-lg bg-slate-800 border border-slate-700';
        pill2.className = todayCount >= 2 
            ? 'w-4 h-9 rounded-lg bg-indigo-500 shadow-lg shadow-indigo-500/40 border border-indigo-400' 
            : 'w-4 h-9 rounded-lg bg-slate-800 border border-slate-700';
    }

    // Daily limit warning
    const dailyAlert = document.getElementById('dailyLimitAlert');
    if (dailyAlert) {
        if (todayCount >= 2) {
            dailyAlert.classList.remove('hidden');
        } else {
            dailyAlert.classList.add('hidden');
        }
    }

    // Stat Cards
    document.getElementById('statWinRate').textContent = `${stats.win_rate || 0}%`;
    document.getElementById('statWinLossCount').textContent = `${stats.wins || 0}W - ${stats.losses || 0}L - ${stats.breakeven || 0}BE`;
    document.getElementById('statTotalTrades').textContent = stats.total_trades || 0;

    const htfPct = stats.rule_adherence ? stats.rule_adherence.htf_4h_pct : 100;
    const ltfPct = stats.rule_adherence ? stats.rule_adherence.ltf_entry_pct : 100;
    const avgRulePct = Math.round((htfPct + ltfPct) / 2);
    document.getElementById('statDiscipline').textContent = `${avgRulePct}%`;

    const riskPct = stats.rule_adherence ? stats.rule_adherence.risk_1pct_pct : 100;
    document.getElementById('statRiskScore').textContent = `${riskPct}%`;

    // Cycle breakdown
    document.getElementById('badgeWins').textContent = stats.wins || 0;
    document.getElementById('badgeLosses').textContent = stats.losses || 0;
    document.getElementById('badgeBE').textContent = stats.breakeven || 0;

    // Auto set Setup # in modal
    const setupSelect = document.getElementById('inputSetupNumber');
    if (setupSelect && !document.getElementById('editTradeId').value) {
        setupSelect.value = todayCount >= 1 ? '2' : '1';
    }
}

// Render Line Chart and Donut Chart
function renderCharts(balanceHistory, stats) {
    // 1. Line Chart
    const ctxLine = document.getElementById('balanceChart').getContext('2d');
    const labels = balanceHistory.map(item => item.date);
    const balanceData = balanceHistory.map(item => item.balance);
    const targetData = new Array(labels.length).fill(stats.target_balance || 100.0);

    if (balanceChartInstance) balanceChartInstance.destroy();

    balanceChartInstance = new Chart(ctxLine, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Balance ($)',
                    data: balanceData,
                    borderColor: '#3B82F6',
                    backgroundColor: 'rgba(59, 130, 246, 0.12)',
                    borderWidth: 2.5,
                    fill: true,
                    tension: 0.25,
                    pointBackgroundColor: '#3B82F6',
                    pointBorderColor: '#0E131F',
                    pointBorderWidth: 2,
                    pointRadius: 4,
                    pointHoverRadius: 6
                },
                {
                    label: '$100 Target Threshold',
                    data: targetData,
                    borderColor: '#10B981',
                    borderWidth: 1.5,
                    borderDash: [6, 6],
                    fill: false,
                    pointRadius: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#151A23',
                    titleColor: '#F8FAFC',
                    bodyColor: '#CBD5E1',
                    borderColor: '#334155',
                    borderWidth: 1,
                    padding: 10,
                    callbacks: {
                        label: function(context) {
                            return `${context.dataset.label}: $${Number(context.raw).toFixed(2)}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.04)' },
                    ticks: { color: '#64748B', font: { size: 10, family: 'JetBrains Mono' } }
                },
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.04)' },
                    ticks: {
                        color: '#64748B',
                        font: { size: 10, family: 'JetBrains Mono' },
                        callback: value => `$${value}`
                    }
                }
            }
        }
    });

    // 2. Cycle Donut Chart
    const ctxCycle = document.getElementById('cycleChart').getContext('2d');
    const wins = stats.wins || 0;
    const losses = stats.losses || 0;
    const breakeven = stats.breakeven || 0;

    const hasData = (wins + losses + breakeven) > 0;
    const cycleData = hasData ? [wins, losses, breakeven] : [1];
    const cycleColors = hasData ? ['#10B981', '#F43F5E', '#64748B'] : ['#1E293B'];

    if (cycleChartInstance) cycleChartInstance.destroy();

    cycleChartInstance = new Chart(ctxCycle, {
        type: 'doughnut',
        data: {
            labels: hasData ? ['Wins', 'Losses', 'Break-even'] : ['No Trades Recorded'],
            datasets: [{
                data: cycleData,
                backgroundColor: cycleColors,
                borderWidth: 0,
                hoverOffset: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '72%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    enabled: hasData,
                    backgroundColor: '#151A23',
                    borderColor: '#334155',
                    borderWidth: 1,
                    padding: 10
                }
            }
        }
    });
}

// Render Trade History Table with Edit & Delete actions
function renderTradesTable(trades) {
    const tbody = document.getElementById('tradesTableBody');
    if (!tbody) return;

    let filtered = trades;
    if (currentFilter === 'wins') {
        filtered = trades.filter(t => t.pnl > 0);
    } else if (currentFilter === 'losses') {
        filtered = trades.filter(t => t.pnl < 0);
    }

    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" class="text-center py-10 text-slate-500">
                    <i class="fa-solid fa-folder-open text-2xl mb-2 block opacity-40"></i>
                    No trades found. ${currentUser.role === 'admin' ? 'Click <b>"Log Trade"</b> to record one!' : ''}
                </td>
            </tr>
        `;
        return;
    }

    const isAdmin = currentUser.role === 'admin';

    tbody.innerHTML = filtered.map(trade => {
        const isWin = trade.pnl > 0.0001;
        const isLoss = trade.pnl < -0.0001;
        const pnlColor = isWin ? 'text-emerald-400 font-bold' : (isLoss ? 'text-rose-400 font-bold' : 'text-slate-400');
        const pnlSign = trade.pnl > 0 ? '+' : '';
        const sideBadge = trade.direction === 'LONG' 
            ? '<span class="px-2 py-0.5 text-[10px] font-bold rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">LONG</span>'
            : '<span class="px-2 py-0.5 text-[10px] font-bold rounded bg-rose-500/10 text-rose-400 border border-rose-500/20">SHORT</span>';

        const formattedDate = trade.trade_date 
            ? new Date(trade.trade_date).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
            : '-';

        const rulesList = `
            <div class="flex items-center gap-1.5 flex-wrap">
                <span class="px-1.5 py-0.5 text-[10px] rounded ${trade.rule_htf_4h ? 'bg-blue-950/60 text-blue-300 border border-blue-800/40' : 'bg-red-950/60 text-red-400 border border-red-800/40'}" title="4H HTF Look">4H ${trade.rule_htf_4h ? '✓' : '✗'}</span>
                <span class="px-1.5 py-0.5 text-[10px] rounded ${trade.rule_ltf_entry ? 'bg-indigo-950/60 text-indigo-300 border border-indigo-800/40' : 'bg-red-950/60 text-red-400 border border-red-800/40'}" title="3m/5m Entry">3/5m ${trade.rule_ltf_entry ? '✓' : '✗'}</span>
                <span class="px-1.5 py-0.5 text-[10px] rounded ${trade.rule_risk_1pct ? 'bg-amber-950/60 text-amber-300 border border-amber-800/40' : 'bg-red-950/60 text-red-400 border border-red-800/40'}" title="1% Risk">1% ${trade.rule_risk_1pct ? '✓' : '✗'}</span>
            </div>
        `;

        const photoHtml = trade.image_url 
            ? `<button onclick="openImageModal('${trade.image_url}')" class="group relative block w-10 h-8 rounded-lg border border-slate-700 overflow-hidden bg-slate-900 hover:border-blue-500 transition shadow-sm">
                <img src="${trade.image_url}" alt="chart" class="w-full h-full object-cover">
                <div class="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                    <i class="fa-solid fa-expand text-[10px] text-white"></i>
                </div>
               </button>`
            : `<span class="text-slate-600 text-[11px] italic">None</span>`;

        // Actions: If Admin, show Edit & Delete. If Viewer, show View only icon or disabled
        const actionsHtml = isAdmin 
            ? `<div class="flex items-center justify-end gap-1">
                <button onclick="openEditTradeModal(${trade.id})" class="text-slate-400 hover:text-blue-400 transition p-1.5 rounded-lg hover:bg-slate-800" title="Edit Trade #${trade.id}">
                    <i class="fa-solid fa-pen-to-square"></i>
                </button>
                <button onclick="deleteTrade(${trade.id})" class="text-slate-400 hover:text-rose-400 transition p-1.5 rounded-lg hover:bg-slate-800" title="Delete Trade #${trade.id}">
                    <i class="fa-regular fa-trash-can"></i>
                </button>
               </div>`
            : `<span class="text-slate-600 text-[11px] font-mono-data" title="Viewer mode: view only">#${trade.id}</span>`;

        return `
            <tr class="hover:bg-slate-800/40 transition">
                <td class="py-3 px-4 text-slate-300 font-mono-data">${formattedDate}</td>
                <td class="py-3 px-4 font-bold text-white tracking-wide font-mono-data">${trade.pair}</td>
                <td class="py-3 px-4">${sideBadge}</td>
                <td class="py-3 px-4 text-slate-400 font-mono-data">Setup #${trade.setup_number || 1}</td>
                <td class="py-3 px-4 font-mono-data ${pnlColor}">${pnlSign}$${trade.pnl.toFixed(2)}</td>
                <td class="py-3 px-4 font-semibold text-slate-200 font-mono-data">$${trade.running_balance ? trade.running_balance.toFixed(2) : '-'}</td>
                <td class="py-3 px-4">${rulesList}</td>
                <td class="py-3 px-4">${photoHtml}</td>
                <td class="py-3 px-4 text-right">${actionsHtml}</td>
            </tr>
        `;
    }).join('');
}

// Filter buttons
function filterTrades(type) {
    currentFilter = type;
    ['all', 'wins', 'losses'].forEach(f => {
        const btn = document.getElementById('filter' + f.charAt(0).toUpperCase() + f.slice(1));
        if (btn) {
            if (f === type) {
                btn.className = 'px-3 py-1 rounded-lg text-xs font-semibold bg-blue-600 text-white transition';
            } else {
                btn.className = 'px-3 py-1 rounded-lg text-xs font-semibold bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition';
            }
        }
    });
    renderTradesTable(allTradesData);
}

// Quick pair tag helper
function setPair(symbol) {
    document.getElementById('inputPair').value = symbol;
}

// Image upload preview
function previewImage(input) {
    const previewContainer = document.getElementById('imagePreviewContainer');
    const placeholder = document.getElementById('uploadPlaceholder');
    const previewImg = document.getElementById('imagePreview');

    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function (e) {
            previewImg.src = e.target.result;
            previewContainer.classList.remove('hidden');
            placeholder.classList.add('hidden');
        };
        reader.readAsDataURL(input.files[0]);
    } else {
        previewContainer.classList.add('hidden');
        placeholder.classList.remove('hidden');
    }
}

// ----------------- AUTH FUNCTIONS -----------------

function openLoginModal() {
    document.getElementById('loginModal').classList.remove('hidden');
}

function closeLoginModal() {
    document.getElementById('loginModal').classList.add('hidden');
}

function prefillLogin(user, pass) {
    document.getElementById('loginUsername').value = user;
    document.getElementById('loginPassword').value = pass;
}

async function handleLogin(e) {
    e.preventDefault();
    const btn = document.getElementById('loginSubmitBtn');
    const origHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Logging in...`;

    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value.trim();

    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Login failed');

        currentUser.token = data.token;
        currentUser.role = data.role;
        currentUser.displayName = data.displayName;
        currentUser.username = data.username;

        localStorage.setItem('tracker_token', data.token);
        localStorage.setItem('tracker_role', data.role);
        localStorage.setItem('tracker_name', data.displayName);
        localStorage.setItem('tracker_uname', data.username);

        closeLoginModal();
        renderAuthUI();
        showToast(`Welcome back, ${data.displayName}!`, 'success');
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = origHtml;
    }
}

async function logout() {
    try {
        await fetch('/api/logout', { method: 'POST', headers: getAuthHeaders() });
    } catch (e) {}
    setViewerState();
    renderAuthUI();
    showToast('Logged out. Switched to Viewer mode.', 'info');
}

// ----------------- TRADE CREATE & EDIT MODALS -----------------

function openCreateTradeModal() {
    if (currentUser.role !== 'admin') {
        openLoginModal();
        showToast('Admin password required to log trades.', 'info');
        return;
    }

    const form = document.getElementById('tradeForm');
    form.reset();
    document.getElementById('editTradeId').value = '';
    document.getElementById('modalTitle').textContent = 'Log New Trade';
    document.getElementById('modalSubtitle').textContent = 'Adhere to your 4H HTF and 1% risk rules';
    document.getElementById('saveBtnText').textContent = 'Save Trade & Send to Telegram';
    document.getElementById('saveBtnIcon').className = 'fa-solid fa-paper-plane';
    document.getElementById('currentImageHint').classList.add('hidden');
    document.getElementById('imagePreviewContainer').classList.add('hidden');
    document.getElementById('uploadPlaceholder').classList.remove('hidden');

    setDefaultDateTime();
    document.getElementById('tradeModal').classList.remove('hidden');
}

function openEditTradeModal(tradeId) {
    if (currentUser.role !== 'admin') {
        openLoginModal();
        showToast('Admin password required to edit trades.', 'info');
        return;
    }

    const trade = allTradesData.find(t => t.id === tradeId);
    if (!trade) {
        showToast('Trade not found', 'error');
        return;
    }

    document.getElementById('editTradeId').value = trade.id;
    document.getElementById('modalTitle').textContent = `Edit Trade #${trade.id}`;
    document.getElementById('modalSubtitle').textContent = `Editing ${trade.pair} recorded on ${new Date(trade.trade_date).toLocaleDateString()}`;
    document.getElementById('saveBtnText').textContent = 'Update Trade';
    document.getElementById('saveBtnIcon').className = 'fa-solid fa-floppy-disk';

    // Populate form
    document.getElementById('inputPair').value = trade.pair;
    if (trade.direction === 'LONG') {
        document.getElementById('dirLong').checked = true;
    } else {
        document.getElementById('dirShort').checked = true;
    }

    document.getElementById('inputSetupNumber').value = trade.setup_number || 1;
    
    if (trade.trade_date) {
        const d = new Date(trade.trade_date);
        d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
        document.getElementById('inputDate').value = d.toISOString().slice(0, 16);
    }

    document.getElementById('inputPnl').value = trade.pnl;
    document.getElementById('checkHtf').checked = Boolean(trade.rule_htf_4h);
    document.getElementById('checkLtf').checked = Boolean(trade.rule_ltf_entry);
    document.getElementById('checkRisk').checked = Boolean(trade.rule_risk_1pct);
    document.getElementById('inputNotes').value = trade.notes || '';

    // Image handling
    const previewContainer = document.getElementById('imagePreviewContainer');
    const placeholder = document.getElementById('uploadPlaceholder');
    const previewImg = document.getElementById('imagePreview');
    const currentHint = document.getElementById('currentImageHint');

    if (trade.image_url) {
        previewImg.src = trade.image_url;
        previewContainer.classList.remove('hidden');
        placeholder.classList.remove('hidden');
        currentHint.classList.remove('hidden');
    } else {
        previewContainer.classList.add('hidden');
        placeholder.classList.remove('hidden');
        currentHint.classList.add('hidden');
    }

    document.getElementById('tradeModal').classList.remove('hidden');
}

function closeTradeModal() {
    document.getElementById('tradeModal').classList.add('hidden');
}

// Submit Create or Edit Trade
async function handleTradeSubmit(e) {
    e.preventDefault();
    if (currentUser.role !== 'admin') {
        showToast('Admin access required.', 'error');
        return;
    }

    const btn = document.getElementById('saveTradeBtn');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span>Processing...</span>`;

    const form = document.getElementById('tradeForm');
    const formData = new FormData(form);

    const editId = document.getElementById('editTradeId').value;
    const isEdit = Boolean(editId);

    // Explicitly handle checkboxes if unchecked
    if (!formData.has('rule_htf_4h')) formData.append('rule_htf_4h', 'false');
    if (!formData.has('rule_ltf_entry')) formData.append('rule_ltf_entry', 'false');
    if (!formData.has('rule_risk_1pct')) formData.append('rule_risk_1pct', 'false');

    try {
        const url = isEdit ? `/api/trades/${editId}` : '/api/trades';
        const method = isEdit ? 'PUT' : 'POST';

        const res = await fetch(url, {
            method: method,
            headers: getAuthHeaders(),
            body: formData
        });

        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.detail || 'Failed to save trade');
        }

        let telegramMsg = '';
        if (data.telegram) {
            telegramMsg = data.telegram.success 
                ? ' • Sent to Telegram ✈️' 
                : ` • (Telegram: ${data.telegram.message})`;
        }

        const successMsg = isEdit 
            ? `Trade #${editId} updated successfully!` 
            : `Trade saved successfully!${telegramMsg}`;

        showToast(successMsg, 'success');

        closeTradeModal();
        await fetchTrades();
    } catch (err) {
        showToast(`Error: ${err.message}`, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

// Delete Trade (Admin only)
async function deleteTrade(id) {
    if (currentUser.role !== 'admin') {
        openLoginModal();
        showToast('Admin password required to delete trades.', 'info');
        return;
    }

    if (!confirm(`Are you sure you want to delete Trade #${id}?`)) return;

    try {
        const res = await fetch(`/api/trades/${id}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Failed to delete trade');

        showToast(`Trade #${id} deleted.`, 'info');
        await fetchTrades();
    } catch (err) {
        showToast(`Delete failed: ${err.message}`, 'error');
    }
}

// Test Telegram Bot
async function testTelegram() {
    if (currentUser.role !== 'admin') {
        openLoginModal();
        showToast('Admin password required to test Telegram.', 'info');
        return;
    }

    const btn = document.getElementById('testTelegramBtn');
    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin text-sky-400"></i> Testing...`;

    try {
        const res = await fetch('/api/test-telegram', {
            method: 'POST',
            headers: getAuthHeaders()
        });
        const data = await res.json();
        if (data.success) {
            showToast(data.message, 'success');
        } else {
            showToast(`Telegram status: ${data.message}`, 'error');
        }
    } catch (err) {
        showToast(`Telegram test failed: ${err.message}`, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalHtml;
    }
}

// Lightbox modal controls
function openImageModal(url) {
    document.getElementById('lightboxImage').src = url;
    document.getElementById('imageModal').classList.remove('hidden');
}

function closeImageModal() {
    document.getElementById('imageModal').classList.add('hidden');
}

// Toast notification helper
function showToast(msg, type = 'info') {
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toastMsg');
    const toastIcon = document.getElementById('toastIcon');

    toastMsg.textContent = msg;

    if (type === 'success') {
        toast.className = 'fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl shadow-2xl border bg-emerald-950/90 text-emerald-200 border-emerald-700/60 text-xs font-semibold flex items-center gap-2.5 transition duration-300';
        toastIcon.innerHTML = '<i class="fa-solid fa-circle-check text-emerald-400"></i>';
    } else if (type === 'error') {
        toast.className = 'fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl shadow-2xl border bg-rose-950/90 text-rose-200 border-rose-700/60 text-xs font-semibold flex items-center gap-2.5 transition duration-300';
        toastIcon.innerHTML = '<i class="fa-solid fa-circle-exclamation text-rose-400"></i>';
    } else {
        toast.className = 'fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl shadow-2xl border bg-slate-900/90 text-slate-200 border-slate-700 text-xs font-semibold flex items-center gap-2.5 transition duration-300';
        toastIcon.innerHTML = '<i class="fa-solid fa-circle-info text-blue-400"></i>';
    }

    toast.classList.remove('translate-y-24', 'opacity-0');
    setTimeout(() => {
        toast.classList.add('translate-y-24', 'opacity-0');
    }, 4500);
}
