// Owner Business Insights: decision-focused analytics without external chart libraries.
let ownerAnalyticsOrders = [];
let ownerAnalyticsSetup = false;
let ownerAnalyticsPage = 1;
let ownerAnalyticsComparison = null;
const OWNER_ANALYTICS_PAGE_SIZE = 10;

function analyticsEsc(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
}

function analyticsMoney(value) { return `${Math.round(Number(value) || 0).toLocaleString()} MMK`; }
function analyticsDate(value) {
    return new Date(value).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function analyticsStartOfToday() { const date = new Date(); date.setHours(0, 0, 0, 0); return date; }
function analyticsDaysAgo(days) { const date = analyticsStartOfToday(); date.setDate(date.getDate() - days + 1); return date; }

function initOwnerHistoryPanel() {
    if (!ownerAnalyticsSetup) {
        ownerAnalyticsSetup = true;
        document.querySelectorAll('#owner-hist-filter-bar .hist-range-btn').forEach(button => button.addEventListener('click', () => {
            document.querySelectorAll('#owner-hist-filter-bar .hist-range-btn').forEach(item => item.classList.remove('active'));
            button.classList.add('active');
            applyOwnerAnalyticsRange(button.dataset.range);
        }));
        document.getElementById('owner-hist-custom-apply')?.addEventListener('click', applyOwnerAnalyticsCustomRange);
    }
    applyOwnerAnalyticsRange(document.querySelector('#owner-hist-filter-bar .hist-range-btn.active')?.dataset.range || '30days');
}

function applyOwnerAnalyticsRange(mode) {
    const customRow = document.getElementById('owner-hist-custom-row');
    if (mode === 'custom') { customRow?.classList.add('show'); return; }
    customRow?.classList.remove('show');
    const end = new Date();
    let start = null;
    if (mode === 'today') start = analyticsStartOfToday();
    if (mode === '7days') start = analyticsDaysAgo(7);
    if (mode === '30days') start = analyticsDaysAgo(30);
    loadOwnerBusinessInsights(start?.toISOString() || null, end.toISOString());
}

function applyOwnerAnalyticsCustomRange() {
    const from = document.getElementById('owner-hist-from')?.value;
    const to = document.getElementById('owner-hist-to')?.value;
    if (!from || !to) return;
    const start = new Date(`${from}T00:00:00`);
    const end = new Date(`${to}T23:59:59.999`);
    if (start > end) { showToast('The start date must be before the end date.', 'warning'); return; }
    loadOwnerBusinessInsights(start.toISOString(), end.toISOString());
}

async function loadOwnerBusinessInsights(startISO, endISO) {
    const container = document.getElementById('owner-hist-content');
    if (!container || !ownerShop) return;
    container.innerHTML = '<div class="hist-loading"><div class="hist-spinner"></div><span>Building business insights...</span></div>';
    const select = (tracking, feedback = true) => `id, customer_name, status, total_amount, delivery_note, created_at,
        ${tracking ? 'estimated_delivery_at, accepted_at, ready_at, sent_at, updated_at,' : ''}
        order_items (quantity, price, menu_items (name)), payments (payment_method, screenshot_url)
        ${feedback ? ', order_feedback (rating, comment, created_at)' : ''}`;
    const fetchOrders = (tracking, feedback = true) => {
        let query = supabaseClient.from('orders').select(select(tracking, feedback)).eq('shop_id', ownerShop.id).order('created_at', { ascending: false });
        if (startISO) query = query.gte('created_at', startISO);
        if (endISO) query = query.lte('created_at', endISO);
        return query;
    };
    let { data, error } = await fetchOrders(true, true);
    if (error && (error.code === '42703' || /estimated_delivery_at|accepted_at|ready_at|sent_at/i.test(error.message || ''))) {
        ({ data, error } = await fetchOrders(false, true));
    }
    if (error && (/order_feedback/i.test(error.message || '') || ['PGRST200', 'PGRST205'].includes(error.code))) {
        ({ data, error } = await fetchOrders(false, false));
    }
    if (error) {
        container.innerHTML = `<div class="hist-error">⚠ ${analyticsEsc(error.message)}</div>`;
        return;
    }
    ownerAnalyticsOrders = data || [];
    ownerAnalyticsComparison = null;
    if (startISO && endISO) {
        const start = new Date(startISO); const end = new Date(endISO); const duration = end - start;
        if (duration > 0) {
            const previousStart = new Date(start.getTime() - duration).toISOString();
            const previousEnd = new Date(start.getTime() - 1).toISOString();
            const previous = await supabaseClient.from('orders').select('status, total_amount')
                .eq('shop_id', ownerShop.id).gte('created_at', previousStart).lte('created_at', previousEnd);
            if (!previous.error) {
                const delivered = (previous.data || []).filter(order => order.status === 'delivered');
                ownerAnalyticsComparison = { completed: delivered.length, revenue: delivered.reduce((sum, order) => sum + Number(order.total_amount || 0), 0) };
            }
        }
    }
    ownerAnalyticsPage = 1;
    renderOwnerBusinessInsights();
}

function getFeedback(order) {
    return Array.isArray(order.order_feedback) ? order.order_feedback[0] : order.order_feedback;
}

function minutesBetween(start, end) {
    if (!start || !end) return null;
    const value = (new Date(end) - new Date(start)) / 60000;
    return Number.isFinite(value) && value >= 0 ? value : null;
}

function buildAnalytics(orders) {
    const completed = orders.filter(order => order.status === 'delivered');
    const cancelled = orders.filter(order => order.status === 'cancelled');
    const revenue = completed.reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
    const menu = new Map();
    const days = new Map();
    const hours = Array(24).fill(0);
    const ratings = [0, 0, 0, 0, 0, 0];
    const prepTimes = [];
    const deliveryTimes = [];
    let late = 0;
    orders.forEach(order => {
        const date = new Date(order.created_at);
        const dayKey = date.toLocaleDateString('en-CA');
        const day = days.get(dayKey) || { label: date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }), revenue: 0, orders: 0 };
        day.orders += 1;
        if (order.status === 'delivered') day.revenue += Number(order.total_amount || 0);
        days.set(dayKey, day);
        hours[date.getHours()] += 1;
        if (order.status === 'delivered') (order.order_items || []).forEach(item => {
            const name = item.menu_items?.name || 'Unknown item';
            const row = menu.get(name) || { name, quantity: 0, revenue: 0 };
            row.quantity += Number(item.quantity || 0);
            row.revenue += Number(item.price || 0) * Number(item.quantity || 0);
            menu.set(name, row);
        });
        const feedback = getFeedback(order);
        if (feedback?.rating) ratings[Number(feedback.rating)] += 1;
        const prep = minutesBetween(order.accepted_at, order.ready_at);
        const delivery = minutesBetween(order.sent_at, order.updated_at);
        if (prep !== null) prepTimes.push(prep);
        if (order.status === 'delivered' && delivery !== null) deliveryTimes.push(delivery);
        if (order.status === 'delivered' && order.estimated_delivery_at && new Date(order.updated_at) > new Date(order.estimated_delivery_at)) late += 1;
    });
    const feedbackCount = ratings.reduce((sum, count) => sum + count, 0);
    const ratingTotal = ratings.reduce((sum, count, rating) => sum + count * rating, 0);
    const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
    return {
        completed, cancelled, revenue, days: [...days.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, value]) => value),
        menu: [...menu.values()].sort((a, b) => b.quantity - a.quantity), hours, ratings, feedbackCount,
        averageRating: feedbackCount ? ratingTotal / feedbackCount : 0,
        averageOrder: completed.length ? revenue / completed.length : 0,
        completionRate: orders.length ? completed.length / orders.length * 100 : 0,
        cancellationRate: orders.length ? cancelled.length / orders.length * 100 : 0,
        averagePrep: average(prepTimes), averageDelivery: average(deliveryTimes), late
    };
}

function renderSummary(data) {
    const change = (current, previous) => {
        if (!ownerAnalyticsComparison || !previous) return 'No previous-period baseline';
        const percentage = (current - previous) / previous * 100;
        return `${percentage >= 0 ? '↑' : '↓'} ${Math.abs(percentage).toFixed(0)}% vs previous period`;
    };
    const cards = [
        ['💰', 'Revenue', analyticsMoney(data.revenue), change(data.revenue, ownerAnalyticsComparison?.revenue)],
        ['✅', 'Completed orders', data.completed.length.toLocaleString(), change(data.completed.length, ownerAnalyticsComparison?.completed)],
        ['🧾', 'Average order', analyticsMoney(data.averageOrder), 'Revenue per completed order'],
        ['★', 'Average rating', data.feedbackCount ? `${data.averageRating.toFixed(1)} / 5` : '—', `${data.feedbackCount} customer reviews`]
    ];
    return `<div class="analytics-summary-grid">${cards.map(([icon, label, value, note]) => `<article class="analytics-kpi"><span>${icon}</span><div><small>${label}</small><strong>${value}</strong><p>${note}</p></div></article>`).join('')}</div>`;
}

function renderSalesTrend(data) {
    const points = data.days.slice(-14);
    const max = Math.max(1, ...points.map(point => point.revenue));
    return `<section class="analytics-card analytics-span-2"><div class="analytics-section-head"><div><h3>Sales trend</h3><p>Completed-order revenue by day</p></div><strong>${analyticsMoney(data.revenue)}</strong></div>
        <div class="analytics-bar-chart">${points.length ? points.map(point => `<div class="analytics-bar-item" title="${analyticsMoney(point.revenue)} · ${point.orders} orders"><span>${point.revenue ? analyticsMoney(point.revenue) : '0'}</span><i style="height:${Math.max(4, point.revenue / max * 100)}%"></i><small>${point.label}</small></div>`).join('') : '<p class="analytics-no-data">No sales data yet.</p>'}</div></section>`;
}

function renderRecommendations(data) {
    const peakCount = Math.max(...data.hours);
    const peakHour = data.hours.indexOf(peakCount);
    const top = data.menu[0];
    const notes = [];
    if (top) notes.push(['success', 'Best seller', `${top.name} sold ${top.quantity} units. Keep enough stock ready.`]);
    if (peakCount) notes.push(['info', 'Peak ordering time', `Most orders arrive between ${peakHour}:00 and ${peakHour + 1}:00. Prepare before this period.`]);
    if (data.cancellationRate >= 10) notes.push(['warning', 'Cancellations need attention', `${data.cancellationRate.toFixed(0)}% of orders were cancelled. Review payment proof and preparation delays.`]);
    if (data.averageRating && data.averageRating < 4) notes.push(['danger', 'Customer satisfaction', `Average rating is ${data.averageRating.toFixed(1)}. Review recent low-rating feedback.`]);
    if (data.late) notes.push(['warning', 'Late deliveries', `${data.late} completed orders passed their estimated arrival time.`]);
    if (!notes.length) notes.push(['success', 'Operations look healthy', 'No urgent issue was detected for this period.']);
    return `<section class="analytics-card"><div class="analytics-section-head"><div><h3>Needs attention</h3><p>Actionable recommendations</p></div></div><div class="analytics-insight-list">${notes.map(([tone, title, text]) => `<article class="analytics-insight ${tone}"><span></span><div><strong>${title}</strong><p>${text}</p></div></article>`).join('')}</div></section>`;
}

function renderBestSellers(data) {
    const items = data.menu.slice(0, 5); const max = Math.max(1, ...items.map(item => item.quantity));
    return `<section class="analytics-card"><div class="analytics-section-head"><div><h3>Best-selling menu</h3><p>Ranked by units sold</p></div></div><div class="analytics-ranking">${items.length ? items.map((item, index) => `<article><b>${index + 1}</b><div><div><strong>${analyticsEsc(item.name)}</strong><span>${item.quantity} sold</span></div><i><span style="width:${item.quantity / max * 100}%"></span></i></div><em>${analyticsMoney(item.revenue)}</em></article>`).join('') : '<p class="analytics-no-data">Completed orders will reveal your best sellers.</p>'}</div></section>`;
}

function renderOperations(data) {
    const max = Math.max(1, ...data.hours); const activeHours = data.hours.map((count, hour) => ({ count, hour })).filter(item => item.count).sort((a, b) => b.count - a.count).slice(0, 6).sort((a, b) => a.hour - b.hour);
    return `<section class="analytics-card analytics-span-2"><div class="analytics-tabs"><button class="active">Operations</button><span>Order speed and peak demand</span></div><div class="analytics-operations-grid">
        <div><h4>Peak ordering hours</h4><div class="analytics-hour-chart">${activeHours.length ? activeHours.map(item => `<div><small>${item.hour}:00</small><i><span style="width:${item.count / max * 100}%"></span></i><strong>${item.count}</strong></div>`).join('') : '<p class="analytics-no-data">No hourly data yet.</p>'}</div></div>
        <div><h4>Order performance</h4><div class="analytics-metric-list">
            <div><span>Completion rate</span><strong>${data.completionRate.toFixed(0)}%</strong></div><div><span>Cancellation rate</span><strong>${data.cancellationRate.toFixed(0)}%</strong></div>
            <div><span>Average preparation</span><strong>${data.averagePrep === null ? 'Not available' : `${Math.round(data.averagePrep)} min`}</strong></div>
            <div><span>Average delivery</span><strong>${data.averageDelivery === null ? 'Not available' : `${Math.round(data.averageDelivery)} min`}</strong></div><div><span>Late orders</span><strong>${data.late}</strong></div>
        </div></div></div></section>`;
}

function renderSatisfaction(data, orders) {
    const max = Math.max(1, ...data.ratings); const negative = orders.filter(order => Number(getFeedback(order)?.rating) <= 2 && getFeedback(order));
    return `<section class="analytics-card analytics-span-2"><div class="analytics-section-head"><div><h3>Customer satisfaction</h3><p>Rating distribution and reviews needing attention</p></div><strong>${data.feedbackCount ? `${data.averageRating.toFixed(1)} ★` : 'No ratings'}</strong></div><div class="analytics-satisfaction-grid"><div class="analytics-rating-bars">${[5,4,3,2,1].map(rating => `<div><small>${rating} ★</small><i><span style="width:${data.ratings[rating] / max * 100}%"></span></i><strong>${data.ratings[rating]}</strong></div>`).join('')}</div><div class="analytics-negative-reviews"><h4>Recent low ratings</h4>${negative.length ? negative.slice(0, 3).map(order => `<article><strong>Order #${order.id} · ${getFeedback(order).rating} ★</strong><p>${analyticsEsc(getFeedback(order).comment || 'No written comment.')}</p></article>`).join('') : '<p class="analytics-no-data">No 1–2 star feedback in this period.</p>'}</div></div></section>`;
}

function renderOrderTable(orders) {
    return `<section class="analytics-card analytics-span-2 analytics-orders"><div class="analytics-section-head"><div><h3>Order records</h3><p>Search, filter and open a row for full details</p></div><span id="analytics-order-count"></span></div><div class="analytics-table-tools"><input type="search" id="analytics-order-search" placeholder="Search customer or order #" oninput="filterAnalyticsOrders()"><select id="analytics-order-status" onchange="filterAnalyticsOrders()"><option value="all">All statuses</option><option value="delivered">Received</option><option value="cancelled">Cancelled</option><option value="pending">Pending</option><option value="preparing">Preparing</option><option value="ready">Ready</option><option value="out_for_delivery">Sent</option></select></div><div id="analytics-order-table"></div></section>`;
}

function filterAnalyticsOrders(reset = true) {
    if (reset) ownerAnalyticsPage = 1;
    const search = document.getElementById('analytics-order-search')?.value.trim().toLowerCase() || '';
    const status = document.getElementById('analytics-order-status')?.value || 'all';
    const filtered = ownerAnalyticsOrders.filter(order => (status === 'all' || order.status === status) && (!search || String(order.id).includes(search.replace('#', '')) || String(order.customer_name || '').toLowerCase().includes(search)));
    const visible = filtered.slice(0, ownerAnalyticsPage * OWNER_ANALYTICS_PAGE_SIZE);
    const statusLabels = { pending:'Pending', preparing:'Preparing', ready:'Ready', out_for_delivery:'Sent', delivered:'Received', cancelled:'Cancelled' };
    document.getElementById('analytics-order-count').textContent = `${visible.length} of ${filtered.length} orders`;
    document.getElementById('analytics-order-table').innerHTML = filtered.length ? `<div class="analytics-table"><div class="analytics-table-head"><span>Order</span><span>Customer</span><span>Items</span><span>Total</span><span>Status</span></div>${visible.map(order => {
        const items = (order.order_items || []).map(item => `${analyticsEsc(item.menu_items?.name || 'Item')} ×${item.quantity}`).join(', ');
        const payment = Array.isArray(order.payments) ? order.payments[0] : order.payments;
        return `<details class="analytics-order-row"><summary><span><strong>#${order.id}</strong><small>${analyticsDate(order.created_at)}</small></span><span>${analyticsEsc(order.customer_name || 'Unknown')}</span><span>${items || '—'}</span><span>${analyticsMoney(order.total_amount)}</span><span class="order-status order-status--${order.status === 'out_for_delivery' ? 'sent' : order.status === 'delivered' ? 'received' : order.status}">${statusLabels[order.status] || order.status}</span></summary><div class="analytics-order-detail"><div><small>Payment</small><strong>${analyticsEsc(payment?.payment_method || 'Not recorded')}</strong></div><div><small>Delivery note</small><strong>${analyticsEsc(order.delivery_note || 'No note')}</strong></div><div><small>Timeline</small><strong>${order.accepted_at ? `Accepted ${analyticsDate(order.accepted_at)}` : 'Tracking not available'}</strong></div><div><small>Feedback</small><strong>${getFeedback(order) ? `${getFeedback(order).rating} ★ · ${analyticsEsc(getFeedback(order).comment || 'No comment')}` : 'No feedback'}</strong></div></div></details>`;
    }).join('')}</div>${visible.length < filtered.length ? '<button class="analytics-load-more" onclick="ownerAnalyticsPage++;filterAnalyticsOrders(false)">Load more orders</button>' : ''}` : '<div class="hist-empty"><div class="hist-empty-icon">⌕</div><h3>No matching orders</h3><p>Change the search or status filter.</p></div>';
}

function renderOwnerBusinessInsights() {
    const container = document.getElementById('owner-hist-content');
    if (!container) return;
    const data = buildAnalytics(ownerAnalyticsOrders);
    container.innerHTML = `${renderSummary(data)}<div class="analytics-dashboard-grid">${renderSalesTrend(data)}${renderRecommendations(data)}${renderBestSellers(data)}${renderOperations(data)}${renderSatisfaction(data, ownerAnalyticsOrders)}${renderOrderTable(ownerAnalyticsOrders)}</div>`;
    filterAnalyticsOrders();
}
