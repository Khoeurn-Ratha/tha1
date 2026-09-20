let balanceChartInstance = null;
let cycleChartInstance = null;
let allTradesData = [];
let currentFilter = 'all';

// Session state from localStorage
let currentUser = {
    token: localStorage.getItem('tracker_token') || null,
    role: localStorage.getItem('tracker_role') || 'user',
    displayName: localStorage.getItem('tracker_name') || 'Viewer',
    username: localStorage.getItem('tracker_uname') || 'user'
};

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
    initVibrantMarketBackground();
    setDefaultDateTime();
    renderAuthUI();
    fetchTrades();
    verifyAuth();
});

// ================= VIBRANT CANDLESTICK & PARTICLE CANVAS BACKGROUND =================
function initVibrantMarketBackground() {
    const canvas = document.getElementById('bgCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    window.addEventListener('resize', () => {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
        initEntities();
    });

    const mouse = { x: -1000, y: -1000, radius: 160 };
    window.addEventListener('mousemove', (e) => {
        mouse.x = e.clientX;
        mouse.y = e.clientY;
    });
    window.addEventListener('mouseleave', () => {
        mouse.x = -1000;
        mouse.y = -1000;
    });

    // 1. Floating Candlesticks (Subtle Ambient Market Watermarks)
    let candlesticks = [];
    class Candlestick {
        constructor() {
            this.reset(true);
        }

        reset(initial = false) {
            this.x = Math.random() * width;
            this.y = initial ? Math.random() * height : height + 50;
            this.vy = -(Math.random() * 0.15 + 0.08); // Very gentle slow rise
            this.vx = (Math.random() - 0.5) * 0.08;
            this.isBullish = Math.random() > 0.45;
            this.bodyHeight = Math.random() * 24 + 10;
            this.bodyWidth = Math.random() * 5 + 3;
            this.wickTop = Math.random() * 10 + 3;
            this.wickBottom = Math.random() * 10 + 3;
            this.alpha = Math.random() * 0.06 + 0.03; // Soft watermark
            this.color = this.isBullish ? '#10B981' : '#F43F5E';
        }

        update() {
            this.y += this.vy;
            this.x += this.vx;
            if (this.y < -60) this.reset();
        }

        draw() {
            ctx.save();
            ctx.globalAlpha = this.alpha;
            ctx.strokeStyle = this.color;
            ctx.fillStyle = this.color;
            ctx.lineWidth = 1;

            // Upper Wick
            ctx.beginPath();
            ctx.moveTo(this.x + this.bodyWidth / 2, this.y - this.wickTop);
            ctx.lineTo(this.x + this.bodyWidth / 2, this.y);
            ctx.stroke();

            // Lower Wick
            ctx.beginPath();
            ctx.moveTo(this.x + this.bodyWidth / 2, this.y + this.bodyHeight);
            ctx.lineTo(this.x + this.bodyWidth / 2, this.y + this.bodyHeight + this.wickBottom);
            ctx.stroke();

            // Candle Body
            ctx.fillRect(this.x, this.y, this.bodyWidth, this.bodyHeight);
            ctx.restore();
        }
    }

    // 2. Data Nodes & Network
    let particles = [];
    class Particle {
        constructor() {
            this.x = Math.random() * width;
            this.y = Math.random() * height;
            this.vx = (Math.random() - 0.5) * 0.35;
            this.vy = (Math.random() - 0.5) * 0.35;
            this.radius = Math.random() * 1.5 + 0.8;
            const colors = ['#10B981', '#06B6D4', '#3B82F6', '#818CF8'];
            this.color = colors[Math.floor(Math.random() * colors.length)];
            this.alpha = Math.random() * 0.2 + 0.08;
        }

        update() {
            this.x += this.vx;
            this.y += this.vy;
            if (this.x < 0 || this.x > width) this.vx *= -1;
            if (this.y < 0 || this.y > height) this.vy *= -1;

            const dx = mouse.x - this.x;
            const dy = mouse.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < mouse.radius) {
                const force = (mouse.radius - dist) / mouse.radius;
                const angle = Math.atan2(dy, dx);
                this.x -= Math.cos(angle) * force * 1.8;
                this.y -= Math.sin(angle) * force * 1.8;
            }
        }

        draw() {
            ctx.save();
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.fillStyle = this.color;
            ctx.globalAlpha = this.alpha;
            ctx.fill();
            ctx.restore();
        }
    }

    function initEntities() {
        particles = [];
        const count = Math.min(32, Math.floor((width * height) / 32000));
        for (let i = 0; i < count; i++) particles.push(new Particle());

        candlesticks = [];
        const candleCount = Math.min(10, Math.floor(width / 120));
        for (let i = 0; i < candleCount; i++) candlesticks.push(new Candlestick());
    }
    initEntities();

    let wavePhase = 0;

    function animate() {
        ctx.clearRect(0, 0, width, height);

        // 1. Draw floating candlesticks
        candlesticks.forEach(c => {
            c.update();
            c.draw();
        });

        // 2. Draw connecting constellation lines
        const maxDist = 120;
        for (let i = 0; i < particles.length; i++) {
            for (let j = i + 1; j < particles.length; j++) {
                const dx = particles[i].x - particles[j].x;
                const dy = particles[i].y - particles[j].y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < maxDist) {
                    ctx.save();
                    ctx.beginPath();
                    ctx.moveTo(particles[i].x, particles[i].y);
                    ctx.lineTo(particles[j].x, particles[j].y);
                    const alpha = (1 - dist / maxDist) * 0.07;
                    ctx.strokeStyle = `rgba(59, 130, 246, ${alpha})`;
                    ctx.lineWidth = 0.8;
                    ctx.stroke();
                    ctx.restore();
                }
            }
        }

        // 3. Draw particles
        particles.forEach(p => {
            p.update();
            p.draw();
        });

        // 4. Undulating market sine wave with soft glow
        wavePhase += 0.008;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(0, height);
        for (let x = 0; x <= width; x += 12) {
            const y = height - 45 + Math.sin(x * 0.006 + wavePhase) * 20 + Math.cos(x * 0.012 - wavePhase * 0.8) * 10;
            ctx.lineTo(x, y);
        }
        ctx.lineTo(width, height);
        ctx.closePath();
        const waveGradient = ctx.createLinearGradient(0, height - 90, 0, height);
        waveGradient.addColorStop(0, 'rgba(16, 185, 129, 0.03)');
        waveGradient.addColorStop(1, 'rgba(59, 130, 246, 0.005)');
        ctx.fillStyle = waveGradient;
        ctx.fill();

        // Wave top subtle line
        ctx.beginPath();
        for (let x = 0; x <= width; x += 12) {
            const y = height - 45 + Math.sin(x * 0.006 + wavePhase) * 20 + Math.cos(x * 0.012 - wavePhase * 0.8) * 10;
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.12)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();

        requestAnimationFrame(animate);
    }
    animate();
}

// ================= AUTH MANAGEMENT =================

function getAuthHeaders() {
    const headers = {};
    if (currentUser.token) {
        headers['Authorization'] = `Bearer ${currentUser.token}`;
    }
    return headers;
}

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

function renderAuthUI() {
    const userContainer = document.getElementById('userBadgeContainer');
    const adminElements = document.querySelectorAll('.admin-only');
    const viewerBanner = document.getElementById('viewerBanner');
    const footerRole = document.getElementById('footerRole');

    if (footerRole) footerRole.textContent = currentUser.displayName;

    if (currentUser.role === 'admin') {
        adminElements.forEach(el => el.classList.remove('hidden'));
        if (viewerBanner) viewerBanner.classList.add('hidden');

        if (userContainer) {
            userContainer.innerHTML = `
                <div class="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 px-3.5 py-1.5 rounded-xl text-xs font-bold text-amber-300 shadow-sm">
                    <span class="text-xs">👑</span>
                    <span class="hidden sm:inline">${currentUser.displayName}</span>
                </div>
                <button onclick="logout()" title="Sign out" class="p-2 rounded-xl bg-black/40 border border-white/10 hover:border-rose-500/50 hover:text-rose-400 text-slate-400 text-xs transition">
                    <i class="fa-solid fa-arrow-right-from-bracket"></i>
                </button>
            `;
        }
    } else {
        adminElements.forEach(el => el.classList.add('hidden'));
        if (viewerBanner) viewerBanner.classList.remove('hidden');

        if (userContainer) {
            userContainer.innerHTML = `
                <div class="flex items-center gap-1.5 bg-blue-500/10 border border-blue-500/25 px-3 py-1.5 rounded-xl text-xs font-semibold text-blue-400">
                    <i class="fa-solid fa-eye text-xs"></i>
                    <span class="hidden sm:inline">Viewer</span>
                </div>
                <button onclick="openLoginModal()" class="px-3.5 py-1.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-white font-bold text-xs border border-white/10 hover:border-blue-500/50 transition flex items-center gap-1.5 shadow-sm">
                    <i class="fa-solid fa-lock text-amber-400 text-xs"></i>
                    <span>Sign In</span>
                </button>
            `;
        }
    }

    renderTradesTable(allTradesData);
}

function selectLoginRole(role) {
    const tabAdmin = document.getElementById('tabAdmin');
    const tabUser = document.getElementById('tabUser');
    const usernameInput = document.getElementById('loginUsername');

    if (!tabAdmin || !tabUser || !usernameInput) return;

    if (role === 'admin') {
        usernameInput.value = 'admin';
        tabAdmin.className = 'py-1.5 text-xs font-bold rounded-lg transition bg-blue-600 text-white shadow-sm flex items-center justify-center gap-1.5';
        tabUser.className = 'py-1.5 text-xs font-semibold rounded-lg transition text-slate-400 hover:text-white flex items-center justify-center gap-1.5';
    } else {
        usernameInput.value = 'user';
        tabUser.className = 'py-1.5 text-xs font-bold rounded-lg transition bg-blue-600 text-white shadow-sm flex items-center justify-center gap-1.5';
        tabAdmin.className = 'py-1.5 text-xs font-semibold rounded-lg transition text-slate-400 hover:text-white flex items-center justify-center gap-1.5';
    }
}

function togglePasswordVisibility() {
    const pwdInput = document.getElementById('loginPassword');
    const icon = document.getElementById('passwordEyeIcon');
    if (!pwdInput) return;

    if (pwdInput.type === 'password') {
        pwdInput.type = 'text';
        icon.className = 'fa-regular fa-eye-slash';
    } else {
        pwdInput.type = 'password';
        icon.className = 'fa-regular fa-eye';
    }
}

function setDefaultDateTime() {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    const formatted = now.toISOString().slice(0, 16);
    const dateInput = document.getElementById('inputDate');
    if (dateInput) dateInput.value = formatted;
}

// Fetch trades and update stats
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

function updateDashboard(data) {
    const stats = data.stats;
    const initial = stats.initial_balance || 10.0;
    const target = stats.target_balance || 100.0;
    const current = stats.current_balance || 10.0;
    const totalTrades = stats.total_trades || 0;

    // Header Balance & Gain
    const displayBalance = document.getElementById('displayBalance');
    if (displayBalance) displayBalance.textContent = `$${current.toFixed(2)}`;

    const gainPct = (((current - initial) / initial) * 100).toFixed(1);
    const gainBadge = document.getElementById('gainBadge');
    if (gainBadge) {
        const sign = current >= initial ? '+' : '';
        gainBadge.textContent = `${sign}${gainPct}%`;
        gainBadge.className = current >= initial 
            ? 'text-xs font-bold font-mono-data px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/25'
            : 'text-xs font-bold font-mono-data px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/25';
    }

    const remaining = Math.max(0, target - current);
    const remainingEl = document.getElementById('remainingAmount');
    if (remainingEl) remainingEl.textContent = `$${remaining.toFixed(2)}`;

    const progressPct = stats.progress_pct || 0;
    const progressBar = document.getElementById('progressBar');
    if (progressBar) progressBar.style.width = `${Math.min(100, progressPct)}%`;

    const progressPctText = document.getElementById('progressPctText');
    if (progressPctText) progressPctText.textContent = `${progressPct}% Completed`;

    const todayCount = stats.today_setups || 0;
    const todayCountEl = document.getElementById('todayCount');
    if (todayCountEl) todayCountEl.textContent = todayCount;

    const pill1 = document.getElementById('pill1');
    const pill2 = document.getElementById('pill2');
    if (pill1 && pill2) {
        pill1.className = todayCount >= 1 
            ? 'w-4 h-9 rounded-lg bg-blue-500 shadow-lg shadow-blue-500/50 border border-blue-400' 
            : 'w-4 h-9 rounded-lg bg-slate-800/80 border border-white/10';
        pill2.className = todayCount >= 2 
            ? 'w-4 h-9 rounded-lg bg-indigo-500 shadow-lg shadow-indigo-500/50 border border-indigo-400' 
            : 'w-4 h-9 rounded-lg bg-slate-800/80 border border-white/10';
    }

    const dailyAlert = document.getElementById('dailyLimitAlert');
    if (dailyAlert) {
        if (todayCount >= 2) dailyAlert.classList.remove('hidden');
        else dailyAlert.classList.add('hidden');
    }

    // ================= 4 RE-ENGINEERED STAT CARDS =================
    // 1. Win Rate Card
    const winRateEl = document.getElementById('statWinRate');
    const winLossCountEl = document.getElementById('statWinLossCount');
    if (totalTrades === 0) {
        winRateEl.textContent = '0.0%';
        winRateEl.className = 'text-2xl font-bold text-slate-400 mt-1 font-mono-data';
        winLossCountEl.textContent = 'No trades recorded';
    } else {
        winRateEl.textContent = `${stats.win_rate}%`;
        winRateEl.className = stats.win_rate >= 50 
            ? 'text-2xl font-bold text-emerald-400 mt-1 font-mono-data' 
            : 'text-2xl font-bold text-rose-400 mt-1 font-mono-data';
        winLossCountEl.textContent = `${stats.wins}W - ${stats.losses}L - ${stats.breakeven}BE`;
    }

    // 2. Net Profit Card
    const netPnlEl = document.getElementById('statNetPnl');
    const profitFactorEl = document.getElementById('statProfitFactor');
    const totalPnl = stats.total_pnl || 0.0;
    const pnlSign = totalPnl >= 0 ? '+' : '';
    netPnlEl.textContent = `${pnlSign}$${totalPnl.toFixed(2)}`;
    netPnlEl.className = totalPnl >= 0 
        ? 'text-2xl font-bold text-emerald-400 mt-1 font-mono-data' 
        : 'text-2xl font-bold text-rose-400 mt-1 font-mono-data';
    profitFactorEl.textContent = `Profit Factor: ${stats.profit_factor || 0.0} • ${totalTrades} Trades`;

    // 3. Discipline Rate Card (Fixed: 0% when 0 trades)
    const disciplineEl = document.getElementById('statDiscipline');
    const disciplineSubEl = document.getElementById('statDisciplineSub');
    if (totalTrades === 0) {
        disciplineEl.textContent = '0%';
        disciplineEl.className = 'text-2xl font-bold text-slate-400 mt-1 font-mono-data';
        disciplineSubEl.textContent = 'No trades logged yet';
    } else {
        const htfPct = stats.rule_adherence ? stats.rule_adherence.htf_4h_pct : 0;
        const ltfPct = stats.rule_adherence ? stats.rule_adherence.ltf_entry_pct : 0;
        const avgRulePct = Math.round((htfPct + ltfPct) / 2);
        disciplineEl.textContent = `${avgRulePct}%`;
        disciplineEl.className = avgRulePct >= 80 
            ? 'text-2xl font-bold text-indigo-400 mt-1 font-mono-data' 
            : 'text-2xl font-bold text-amber-400 mt-1 font-mono-data';
        disciplineSubEl.textContent = `4H (${htfPct}%) • 3/5m (${ltfPct}%)`;
    }

    // 4. 1% Risk Rule Card (Fixed: 0% when 0 trades)
    const riskScoreEl = document.getElementById('statRiskScore');
    const riskSubEl = document.getElementById('statRiskSub');
    if (totalTrades === 0) {
        riskScoreEl.textContent = '0%';
        riskScoreEl.className = 'text-2xl font-bold text-slate-400 mt-1 font-mono-data';
        riskSubEl.textContent = 'No trades logged yet';
    } else {
        const riskPct = stats.rule_adherence ? stats.rule_adherence.risk_1pct_pct : 0;
        riskScoreEl.textContent = `${riskPct}%`;
        riskScoreEl.className = riskPct >= 90 
            ? 'text-2xl font-bold text-amber-400 mt-1 font-mono-data' 
            : 'text-2xl font-bold text-rose-400 mt-1 font-mono-data';
        riskSubEl.textContent = `${riskPct}% adherence maintained`;
    }

    // Cycle breakdown
    document.getElementById('badgeWins').textContent = stats.wins || 0;
    document.getElementById('badgeLosses').textContent = stats.losses || 0;
    document.getElementById('badgeBE').textContent = stats.breakeven || 0;

    const setupSelect = document.getElementById('inputSetupNumber');
    if (setupSelect && !document.getElementById('editTradeId').value) {
        setupSelect.value = todayCount >= 1 ? '2' : '1';
    }
}

function renderCharts(balanceHistory, stats) {
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
                    backgroundColor: 'rgba(59, 130, 246, 0.14)',
                    borderWidth: 2.5,
                    fill: true,
                    tension: 0.25,
                    pointBackgroundColor: '#3B82F6',
                    pointBorderColor: '#0E131F',
                    pointBorderWidth: 2,
                    pointRadius: 4,
                    pointHoverRadius: 7
                },
                {
                    label: '$100 Target Threshold',
                    data: targetData,
                    borderColor: '#10B981',
                    borderWidth: 1.8,
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
                    backgroundColor: '#0A0E18',
                    titleColor: '#F8FAFC',
                    bodyColor: '#CBD5E1',
                    borderColor: 'rgba(255, 255, 255, 0.15)',
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
                    grid: { color: 'rgba(255, 255, 255, 0.03)' },
                    ticks: { color: '#64748B', font: { size: 10, family: 'JetBrains Mono' } }
                },
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.03)' },
                    ticks: {
                        color: '#64748B',
                        font: { size: 10, family: 'JetBrains Mono' },
                        callback: value => `$${value}`
                    }
                }
            }
        }
    });

    const ctxCycle = document.getElementById('cycleChart').getContext('2d');
    const wins = stats.wins || 0;
    const losses = stats.losses || 0;
    const breakeven = stats.breakeven || 0;

    const hasData = (wins + losses + breakeven) > 0;
    const cycleData = hasData ? [wins, losses, breakeven] : [1];
    const cycleColors = hasData ? ['#10B981', '#F43F5E', '#64748B'] : ['#141A28'];

    if (cycleChartInstance) cycleChartInstance.destroy();

    cycleChartInstance = new Chart(ctxCycle, {
        type: 'doughnut',
        data: {
            labels: hasData ? ['Wins', 'Losses', 'Break-even'] : ['No Trades Recorded'],
            datasets: [{
                data: cycleData,
                backgroundColor: cycleColors,
                borderWidth: 0,
                hoverOffset: 8
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
                    backgroundColor: '#0A0E18',
                    borderColor: 'rgba(255, 255, 255, 0.15)',
                    borderWidth: 1,
                    padding: 10
                }
            }
        }
    });
}

function renderTradesTable(trades) {
    const tbody = document.getElementById('tradesTableBody');
    if (!tbody) return;

    let filtered = trades;
    if (currentFilter === 'wins') {
        filtered = trades.filter(t => t.pnl > 0);
    } else if (currentFilter === 'losses') {
        filtered = trades.filter(t => t.pnl < 0);
    }

    // Update dynamic counter badge and footer info
    const countBadge = document.getElementById('journalCountBadge');
    if (countBadge) {
        countBadge.textContent = `${filtered.length} Trade${filtered.length === 1 ? '' : 's'}`;
    }
    const footerInfo = document.getElementById('journalFooterInfo');
    if (footerInfo) {
        footerInfo.textContent = `Showing ${filtered.length} of ${trades.length} recorded trades`;
    }

    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" class="text-center py-12 text-slate-500 font-mono-data">
                    <i class="fa-solid fa-folder-open text-3xl mb-3 block opacity-30 text-slate-400"></i>
                    <p class="text-sm font-semibold text-slate-300">No trade records found</p>
                    <p class="text-xs text-slate-500 mt-1">${currentUser.role === 'admin' ? 'Click <b class="text-blue-400">"Log Trade"</b> to record your first setup.' : 'No trades have been recorded yet.'}</p>
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
        const rowHoverClass = isWin ? 'table-row-win' : (isLoss ? 'table-row-loss' : 'table-row-be');

        const sideBadge = trade.direction === 'LONG' 
            ? '<span class="inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-bold rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/25"><span class="pulse-dot-green"></span> LONG</span>'
            : '<span class="inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-bold rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/25"><span class="pulse-dot-red"></span> SHORT</span>';

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
            ? `<button onclick="openImageModal('${trade.image_url}')" class="group relative block w-10 h-8 rounded-lg border border-white/10 overflow-hidden bg-black/40 hover:border-blue-500 transition shadow-sm mx-auto">
                <img src="${trade.image_url}" alt="chart" class="w-full h-full object-cover">
                <div class="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                    <i class="fa-solid fa-expand text-[10px] text-white"></i>
                </div>
               </button>`
            : `<span class="text-slate-600 text-[11px] italic block text-center">None</span>`;

        const actionsHtml = isAdmin 
            ? `<div class="flex items-center justify-end gap-1">
                <button onclick="openEditTradeModal(${trade.id})" class="text-slate-400 hover:text-blue-400 hover:bg-blue-500/15 transition p-1.5 rounded-lg" title="Edit Trade #${trade.id}">
                    <i class="fa-solid fa-pen-to-square"></i>
                </button>
                <button onclick="deleteTrade(${trade.id})" class="text-slate-400 hover:text-rose-400 hover:bg-rose-500/15 transition p-1.5 rounded-lg" title="Delete Trade #${trade.id}">
                    <i class="fa-regular fa-trash-can"></i>
                </button>
               </div>`
            : `<span class="text-slate-500 text-[11px] font-mono-data">#${trade.id}</span>`;

        return `
            <tr class="${rowHoverClass} border-b border-white/[0.04]">
                <td class="py-3.5 px-6 text-slate-300 font-mono-data">${formattedDate}</td>
                <td class="py-3.5 px-5 font-bold text-white tracking-wide font-mono-data">${trade.pair}</td>
                <td class="py-3.5 px-5">${sideBadge}</td>
                <td class="py-3.5 px-5 text-slate-400 font-mono-data">Setup #${trade.setup_number || 1}</td>
                <td class="py-3.5 px-5 font-mono-data ${pnlColor}">${pnlSign}$${trade.pnl.toFixed(2)}</td>
                <td class="py-3.5 px-5 font-semibold text-slate-200 font-mono-data">$${trade.running_balance ? trade.running_balance.toFixed(2) : '-'}</td>
                <td class="py-3.5 px-5">${rulesList}</td>
                <td class="py-3.5 px-5 text-center">${photoHtml}</td>
                <td class="py-3.5 px-6 text-right">${actionsHtml}</td>
            </tr>
        `;
    }).join('');
}

function filterTrades(type) {
    currentFilter = type;
    ['all', 'wins', 'losses'].forEach(f => {
        const btn = document.getElementById('filter' + f.charAt(0).toUpperCase() + f.slice(1));
        if (btn) {
            if (f === type) {
                btn.className = 'px-3.5 py-1 rounded-lg text-xs font-semibold bg-blue-600 text-white transition shadow-sm hover:shadow-blue-500/30';
            } else {
                btn.className = 'px-3.5 py-1 rounded-lg text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/[0.05] transition';
            }
        }
    });
    renderTradesTable(allTradesData);
}

function setPair(symbol) {
    document.getElementById('inputPair').value = symbol;
}

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

function openLoginModal() {
    document.getElementById('loginModal').classList.remove('hidden');
}

function closeLoginModal() {
    document.getElementById('loginModal').classList.add('hidden');
}

async function handleLogin(e) {
    e.preventDefault();
    const btn = document.getElementById('loginSubmitBtn');
    const origHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin text-xs"></i> <span>Authenticating...</span>`;

    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value.trim();

    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Invalid credentials.');

        currentUser.token = data.token;
        currentUser.role = data.role;
        currentUser.displayName = data.displayName;
        currentUser.username = data.username;

        localStorage.setItem('tracker_token', data.token);
        localStorage.setItem('tracker_role', data.role);
        localStorage.setItem('tracker_name', data.displayName);
        localStorage.setItem('tracker_uname', data.username);

        document.getElementById('loginForm').reset();
        closeLoginModal();
        renderAuthUI();
        showToast(`Authenticated as ${data.displayName}`, 'success');
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
    showToast('Signed out. Switched to Viewer mode.', 'info');
}

function openCreateTradeModal() {
    if (currentUser.role !== 'admin') {
        openLoginModal();
        showToast('Admin credentials required to log trades.', 'info');
        return;
    }

    const form = document.getElementById('tradeForm');
    form.reset();
    document.getElementById('editTradeId').value = '';
    document.getElementById('modalTitle').textContent = 'Log New Trade';
    document.getElementById('modalSubtitle').textContent = 'Strictly adhere to your 4H HTF and 1% risk rules';
    document.getElementById('saveBtnText').textContent = 'Save Trade & Send to Telegram';
    document.getElementById('saveBtnIcon').className = 'fa-solid fa-paper-plane text-xs';
    document.getElementById('currentImageHint').classList.add('hidden');
    document.getElementById('imagePreviewContainer').classList.add('hidden');
    document.getElementById('uploadPlaceholder').classList.remove('hidden');

    setDefaultDateTime();
    document.getElementById('tradeModal').classList.remove('hidden');
}

function openEditTradeModal(tradeId) {
    if (currentUser.role !== 'admin') {
        openLoginModal();
        showToast('Admin credentials required to edit trades.', 'info');
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
    document.getElementById('saveBtnIcon').className = 'fa-solid fa-floppy-disk text-xs';

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

async function handleTradeSubmit(e) {
    e.preventDefault();
    if (currentUser.role !== 'admin') {
        showToast('Admin credentials required.', 'error');
        return;
    }

    const btn = document.getElementById('saveTradeBtn');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin text-xs"></i> <span>Processing...</span>`;

    const form = document.getElementById('tradeForm');
    const formData = new FormData(form);

    const editId = document.getElementById('editTradeId').value;
    const isEdit = Boolean(editId);

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

async function deleteTrade(id) {
    if (currentUser.role !== 'admin') {
        openLoginModal();
        showToast('Admin credentials required to delete trades.', 'info');
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

async function testTelegram() {
    if (currentUser.role !== 'admin') {
        openLoginModal();
        showToast('Admin credentials required to test Telegram.', 'info');
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

function openImageModal(url) {
    document.getElementById('lightboxImage').src = url;
    document.getElementById('imageModal').classList.remove('hidden');
}

function closeImageModal() {
    document.getElementById('imageModal').classList.add('hidden');
}

function showToast(msg, type = 'info') {
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toastMsg');
    const toastIcon = document.getElementById('toastIcon');

    toastMsg.textContent = msg;

    if (type === 'success') {
        toast.className = 'fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl shadow-2xl border bg-[#04241B]/95 text-emerald-300 border-emerald-500/50 text-xs font-semibold flex items-center gap-2.5 transition duration-300';
        toastIcon.innerHTML = '<i class="fa-solid fa-circle-check text-emerald-400"></i>';
    } else if (type === 'error') {
        toast.className = 'fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl shadow-2xl border bg-[#27060C]/95 text-rose-300 border-rose-500/50 text-xs font-semibold flex items-center gap-2.5 transition duration-300';
        toastIcon.innerHTML = '<i class="fa-solid fa-circle-exclamation text-rose-400"></i>';
    } else {
        toast.className = 'fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl shadow-2xl border bg-[#0A101D]/95 text-slate-200 border-white/15 text-xs font-semibold flex items-center gap-2.5 transition duration-300';
        toastIcon.innerHTML = '<i class="fa-solid fa-circle-info text-blue-400"></i>';
    }

    toast.classList.remove('translate-y-24', 'opacity-0');
    setTimeout(() => {
        toast.classList.add('translate-y-24', 'opacity-0');
    }, 4500);
}
