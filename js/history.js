// ============================================================
// history.js  --  Order2Me History Page
// ============================================================
// Handles:
//   1. Auth check & role detection (customer / owner)
//   2. Loading past orders (before today's date)
//   3. Date range filtering for owner
//   4. Rendering rich history cards
//   5. CSV export for owner
// ============================================================

// ── Date helpers ─────────────────────────────────────────────
function getTodayStart() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
}

function getDaysAgoStart(days) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    d.setHours(0, 0, 0, 0);
    return d;
}

function formatDateLabel(dateStr) {
    return new Date(dateStr).toLocaleString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

function formatDateOnly(dateStr) {
    return new Date(dateStr).toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric'
    });
}

function escapeHtml(text) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return String(text).replace(/[&<>"']/g, m => map[m]);
}

function escapeCSV(val) {
    const s = String(val === null || val === undefined ? '' : val);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
}

// ── State ─────────────────────────────────────────────────────
let currentProfile  = null;
let currentRole     = null;
let historyOrders   = [];
let activeRangeMode = 'yesterday';

// ── Toast ─────────────────────────────────────────────────────
function showToast(message, type = 'info') {
    const container = document.getElementById('hist-toast-container');
    if (!container) return;
    const colors = { success: '#10b981', danger: '#ef4444', warning: '#f59e0b', info: '#6366f1' };
    const toast = document.createElement('div');
    toast.style.cssText = `display:flex;align-items:center;gap:10px;padding:12px 18px;border-radius:14px;
        margin-bottom:8px;background:${colors[type]||colors.info};color:#fff;font-weight:600;
        font-size:.88rem;box-shadow:0 10px 28px rgba(0,0,0,.18);max-width:340px;`;
    toast.innerHTML = `<span style="flex:1">${escapeHtml(message)}</span>
        <button onclick="this.parentElement.remove()" style="background:none;border:none;color:#fff;font-size:18px;cursor:pointer">&times;</button>`;
    container.appendChild(toast);
    setTimeout(() => { if (toast.parentElement) toast.remove(); }, 4000);
}

// ── 1. INIT ───────────────────────────────────────────────────
async function initHistoryPage() {
    if (typeof supabaseClient === 'undefined') {
        document.getElementById('hist-content').innerHTML =
            '<div class="hist-error">&#9888; Supabase client not loaded.</div>';
        return;
    }

    const profile = await getCurrentProfile();
    if (!profile) { window.location.href = 'login.html'; return; }

    currentProfile = profile;
    currentRole    = profile.role;

    if (currentRole === 'admin') { window.location.href = 'admin.html'; return; }
    if (currentRole === 'owner' && profile.shop?.status !== 'approved') {
        window.location.href = 'pending.html';
        return;
    }

    const roleEl = document.getElementById('hist-role-badge');
    if (roleEl) roleEl.textContent = currentRole === 'owner' ? '\ud83d\udc51 Owner View' : '\ud83c\udf93 Customer View';

    const nameEl = document.getElementById('hist-user-name');
    if (nameEl) nameEl.textContent = profile.name || profile.email;

    const backLink = document.getElementById('hist-back-link');
    if (backLink) backLink.href = currentRole === 'owner' ? 'owner.html' : 'customer.html';

    if (currentRole === 'owner') {
        setupOwnerUI();
        applyDateRange('yesterday');
    } else {
        document.getElementById('owner-filter-bar')?.classList.add('hist-hidden');
        loadCustomerHistory();
    }
}

// ── 2. OWNER HISTORY ─────────────────────────────────────────
function setupOwnerUI() {
    document.getElementById('owner-filter-bar')?.classList.remove('hist-hidden');
    document.querySelectorAll('.hist-range-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.hist-range-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            applyDateRange(btn.dataset.range);
        });
    });
    document.getElementById('hist-custom-apply')?.addEventListener('click', applyCustomRange);
    document.getElementById('hist-export-btn')?.addEventListener('click', exportCSV);
}

function applyDateRange(mode) {
    activeRangeMode = mode;
    const customRow = document.getElementById('hist-custom-row');
    if (mode === 'custom') { customRow?.classList.remove('hist-hidden'); return; }
    customRow?.classList.add('hist-hidden');

    const todayStart = getTodayStart();
    if (mode === 'yesterday') {
        const rangeEnd = new Date(todayStart.getTime() - 1);
        loadOwnerHistory(getDaysAgoStart(1).toISOString(), rangeEnd.toISOString());
    } else if (mode === '7days') {
        loadOwnerHistory(getDaysAgoStart(7).toISOString(), todayStart.toISOString());
    } else if (mode === '30days') {
        loadOwnerHistory(getDaysAgoStart(30).toISOString(), todayStart.toISOString());
    } else if (mode === 'all') {
        loadOwnerHistory(null, todayStart.toISOString());
    }
}

function applyCustomRange() {
    const fromVal = document.getElementById('hist-from-date')?.value;
    const toVal   = document.getElementById('hist-to-date')?.value;
    if (!fromVal || !toVal) { showToast('Select both From and To dates.', 'warning'); return; }
    const fromDate = new Date(fromVal + 'T00:00:00');
    let   toDate   = new Date(toVal   + 'T23:59:59');
    if (fromDate > toDate) { showToast('"From" must be before "To".', 'warning'); return; }
    const todayStart = getTodayStart();
    if (toDate >= todayStart) toDate = new Date(todayStart.getTime() - 1);
    loadOwnerHistory(fromDate.toISOString(), toDate.toISOString());
}

async function loadOwnerHistory(startISO, endISO) {
    const container = document.getElementById('hist-content');
    container.innerHTML = '<div class="hist-loading"><div class="hist-spinner"></div><span>Loading history...</span></div>';

    let query = supabaseClient
        .from('orders')
        .select(`id, customer_name, status, total_amount, delivery_note, created_at,
            order_items ( quantity, price, menu_items ( name ) ),
            payments ( payment_method, screenshot_url )`)
        .order('created_at', { ascending: false });

    query = query.eq('shop_id', currentProfile.shop.id);

    if (startISO) query = query.gte('created_at', startISO);
    if (endISO)   query = query.lt('created_at', endISO);

    const { data, error } = await query;
    if (error) { container.innerHTML = `<div class="hist-error">&#9888; ${escapeHtml(error.message)}</div>`; return; }

    historyOrders = data || [];
    renderOwnerHistory(historyOrders);
}

function renderOwnerHistory(orders) {
    const container = document.getElementById('hist-content');
    const total     = orders.length;
    const revenue   = orders.reduce((s, o) => s + Number(o.total_amount || 0), 0);
    const avg       = total > 0 ? revenue / total : 0;
    const delivered = orders.filter(o => o.status === 'delivered').length;
    const cancelled = orders.filter(o => o.status === 'cancelled').length;

    const statsHtml = `
    <div class="hist-stats-grid">
        <div class="hist-stat-card"><div class="hist-stat-icon">\ud83d\udce6</div><div class="hist-stat-value">${total}</div><div class="hist-stat-label">Total Orders</div></div>
        <div class="hist-stat-card"><div class="hist-stat-icon">\ud83d\udcb0</div><div class="hist-stat-value">${revenue.toLocaleString()}</div><div class="hist-stat-label">Revenue (MMK)</div></div>
        <div class="hist-stat-card"><div class="hist-stat-icon">\ud83d\udcca</div><div class="hist-stat-value">${Math.round(avg).toLocaleString()}</div><div class="hist-stat-label">Avg Order (MMK)</div></div>
        <div class="hist-stat-card"><div class="hist-stat-icon">\u2705</div><div class="hist-stat-value">${delivered}</div><div class="hist-stat-label">Delivered</div></div>
        <div class="hist-stat-card"><div class="hist-stat-icon">\u274c</div><div class="hist-stat-value">${cancelled}</div><div class="hist-stat-label">Cancelled</div></div>
    </div>`;

    if (!orders.length) {
        container.innerHTML = statsHtml + '<div class="hist-empty"><div class="hist-empty-icon">\ud83d\udceb</div><h3>No orders in this period</h3><p>Try a different date range.</p></div>';
        return;
    }

    const STATUS_BADGE = {
        pending:   { bg: '#f59e0b', label: 'Pending'   },
        preparing: { bg: '#06b6d4', label: 'Preparing' },
        ready:     { bg: '#10b981', label: 'Ready'     },
        delivered: { bg: '#64748b', label: 'Delivered' },
        cancelled: { bg: '#ef4444', label: 'Cancelled' },
    };

    const cardsHtml = orders.map(order => {
        const s = STATUS_BADGE[order.status] || { bg: '#94a3b8', label: order.status };
        const payment = order.payments ? (Array.isArray(order.payments) ? order.payments[0] : order.payments) : null;
        const itemsHtml = (order.order_items || []).map(oi => {
            const name = oi.menu_items ? oi.menu_items.name : 'Item';
            return `<div class="hist-item-row"><span>${escapeHtml(name)} &times; ${oi.quantity}</span><span>${(oi.price*oi.quantity).toLocaleString()} MMK</span></div>`;
        }).join('');
        const payHtml  = payment ? `<span class="hist-badge" style="background:#1e293b">${escapeHtml(payment.payment_method)}</span>` : '';
        const noteHtml = order.delivery_note ? `<div class="hist-note">\ud83d\udccd ${escapeHtml(order.delivery_note)}</div>` : '';
        return `
        <div class="hist-card">
            <div class="hist-card-header">
                <div>
                    <div class="hist-card-id">Order #${order.id}</div>
                    <div class="hist-card-meta">\ud83d\udc64 ${escapeHtml(order.customer_name||'Unknown')}</div>
                    <div class="hist-card-meta">\ud83d\udd50 ${formatDateLabel(order.created_at)}</div>
                </div>
                <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
                    <span class="hist-badge" style="background:${s.bg}">${s.label}</span>
                    ${payHtml}
                </div>
            </div>
            <div class="hist-card-items">${itemsHtml}</div>
            ${noteHtml}
            <div class="hist-card-total">Total: ${Number(order.total_amount).toLocaleString()} MMK</div>
        </div>`;
    }).join('');

    container.innerHTML = statsHtml + `<div class="hist-cards-list">${cardsHtml}</div>`;
}

// ── 3. CUSTOMER HISTORY ────────────────────────────────────────
async function loadCustomerHistory() {
    const container = document.getElementById('hist-content');
    container.innerHTML = '<div class="hist-loading"><div class="hist-spinner"></div><span>Loading your history...</span></div>';

    const { data, error } = await supabaseClient
        .from('orders')
        .select(`id, status, total_amount, delivery_note, created_at, shops (name),
            order_items ( quantity, price, menu_items (name) ),
            payments ( payment_method )`)
        .eq('customer_id', currentProfile.id)
        .lt('created_at', getTodayStart().toISOString())
        .order('created_at', { ascending: false });

    if (error) { container.innerHTML = `<div class="hist-error">&#9888; ${escapeHtml(error.message)}</div>`; return; }

    historyOrders = data || [];
    renderCustomerHistory(historyOrders);
}

function renderCustomerHistory(orders) {
    const container = document.getElementById('hist-content');
    if (!orders.length) {
        container.innerHTML = `
            <div class="hist-empty">
                <div class="hist-empty-icon">\ud83d\udceb</div>
                <h3>No past orders found</h3>
                <p>Orders you've placed on previous days will appear here.</p>
                <a href="customer.html" class="hist-back-btn">Browse Menu</a>
            </div>`;
        return;
    }

    const STATUS_BADGE = {
        pending:   { bg: '#f59e0b', label: 'Pending'   },
        preparing: { bg: '#06b6d4', label: 'Preparing' },
        ready:     { bg: '#10b981', label: 'Ready'     },
        delivered: { bg: '#64748b', label: 'Delivered' },
        cancelled: { bg: '#ef4444', label: 'Cancelled' },
    };

    const grouped = {};
    orders.forEach(o => {
        const k = formatDateOnly(o.created_at);
        (grouped[k] = grouped[k] || []).push(o);
    });

    let html = '';
    Object.entries(grouped).forEach(([day, dayOrders]) => {
        html += `<div class="hist-date-group"><div class="hist-date-label">\ud83d\udcc5 ${day}</div>`;
        dayOrders.forEach(order => {
            const s = STATUS_BADGE[order.status] || { bg: '#94a3b8', label: order.status };
            const payment = order.payments ? (Array.isArray(order.payments) ? order.payments[0] : order.payments) : null;
            const items = (order.order_items||[]).map(oi => `${oi.menu_items?.name||'Item'} \xd7${oi.quantity}`).join(' \u2022 ');
            const time  = new Date(order.created_at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
            const payBadge = payment ? `<span class="hist-badge" style="background:#1e293b;font-size:.7rem">${escapeHtml(payment.payment_method)}</span>` : '';
            html += `
            <div class="hist-card">
                <div class="hist-card-header">
                    <div>
                        <div class="hist-card-id">Order #${order.id}</div>
                        <div class="hist-card-meta">Shop: ${escapeHtml(order.shops?.name || 'Shop')} · ${time}</div>
                    </div>
                    <div style="display:flex;flex-direction:column;align-items:flex-end;gap:5px">
                        <span class="hist-badge" style="background:${s.bg}">${s.label}</span>
                        ${payBadge}
                    </div>
                </div>
                <div class="hist-item-summary">${escapeHtml(items)||'\u2014'}</div>
                <div class="hist-card-total">\ud83d\udcb0 ${Number(order.total_amount).toLocaleString()} MMK</div>
            </div>`;
        });
        html += '</div>';
    });

    container.innerHTML = `<div class="hist-cards-list">${html}</div>`;
}

// ── 4. CSV EXPORT ─────────────────────────────────────────────
function exportCSV() {
    if (!historyOrders.length) { showToast('No orders to export.', 'warning'); return; }
    const rows = [['Order ID','Customer','Status','Total (MMK)','Payment','Items','Date']];
    historyOrders.forEach(o => {
        const payment = o.payments ? (Array.isArray(o.payments)?o.payments[0]:o.payments) : null;
        const items = (o.order_items||[]).map(oi=>`${oi.menu_items?.name||'Item'} x${oi.quantity}`).join('; ');
        rows.push([o.id, o.customer_name||'', o.status, o.total_amount, payment?payment.payment_method:'', items, formatDateLabel(o.created_at)]);
    });
    const csv  = rows.map(r => r.map(escapeCSV).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `order2me_history_${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
    showToast('CSV exported!', 'success');
}

// ── Boot ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', initHistoryPage);
